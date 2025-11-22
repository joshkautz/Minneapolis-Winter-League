import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/shared/components'
import { useManageEditTeamForm } from './hooks/use-manage-edit-team-form'
import { useTeamManagement } from './hooks/use-team-management'

interface ManageEditTeamFormProps {
	handleResult: ({
		success,
		title,
		description,
		navigation,
	}: {
		success: boolean
		title: string
		description: string
		navigation: boolean
	}) => void
}

export const ManageEditTeamForm = ({
	handleResult,
}: ManageEditTeamFormProps) => {
	const { isLoading, hasTeam, isCaptain } = useTeamManagement()
	const { form, onSubmit, handleFileChange, blob, isSubmitting, team } =
		useManageEditTeamForm({
			handleResult,
		})

	const currentLogo = team?.data().logo

	// Show loading state
	if (isLoading) {
		return (
			<div className='flex items-center justify-center min-h-[200px]'>
				<LoadingSpinner size='lg' label='Loading team data...' />
			</div>
		)
	}

	// Show error states
	if (!hasTeam) {
		return (
			<div className='text-center py-8'>
				<p className='text-muted-foreground'>No team found</p>
				<p className='text-sm text-muted-foreground mt-2'>
					You don't appear to be on a team for this season
				</p>
			</div>
		)
	}

	if (!isCaptain) {
		return (
			<div className='text-center py-8'>
				<p className='text-muted-foreground'>Permission denied</p>
				<p className='text-sm text-muted-foreground mt-2'>
					Only team captains can edit team information
				</p>
			</div>
		)
	}

	return (
		<div className='w-full'>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className='space-y-6'
					noValidate
				>
					<FormField
						control={form.control}
						name='name'
						render={({ field }) => (
							<FormItem>
								<FormLabel className='text-sm font-medium'>Team Name</FormLabel>
								<FormControl>
									<Input
										placeholder={team?.data().name ?? 'Team name'}
										autoComplete='off'
										autoFocus
										{...field}
										value={field.value ?? ''}
										aria-describedby={
											form.formState.errors.name ? `name-error` : undefined
										}
									/>
								</FormControl>
								<FormMessage id='name-error' />
							</FormItem>
						)}
					/>

					<div className='space-y-2'>
						<Label htmlFor='team-logo-upload'>Team Logo (Optional)</Label>
						<Input
							id='team-logo-upload'
							type='file'
							accept='image/*'
							onChange={handleFileChange}
							disabled={isSubmitting}
						/>
					</div>

					{/* Logo preview */}
					{blob ? (
						<div className='group flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-hidden'>
							<img
								src={URL.createObjectURL(blob)}
								alt='Team logo preview'
								className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
							/>
						</div>
					) : currentLogo ? (
						<div className='group flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-hidden'>
							<img
								src={currentLogo}
								alt='Current team logo'
								className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
							/>
						</div>
					) : (
						<div className='flex items-center justify-center w-40 h-40 mx-auto rounded-md bg-muted'>
							<span className='text-sm text-muted-foreground'>No logo</span>
						</div>
					)}

					<div className='pt-2'>
						<Button
							type='submit'
							disabled={isSubmitting}
							className='w-full'
						>
							{isSubmitting ? 'Updating Team...' : 'Save Changes'}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	)
}
