import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ImageField, LoadingSpinner, LoadingButton } from '@/shared/components'
import { useManageEditTeamForm } from './hooks/use-manage-edit-team-form'
import { useTeamManagement } from './hooks/use-team-management'
import type { FormResult } from '@/shared/types'

interface ManageEditTeamFormProps {
	handleResult: (result: FormResult) => void
}

export const ManageEditTeamForm = ({
	handleResult,
}: ManageEditTeamFormProps) => {
	const { isLoading, hasTeam, isCaptain } = useTeamManagement()
	const { form, onSubmit, handleLogoChange, blob, isSubmitting, team } =
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

					<ImageField
						label='Team Logo (Optional)'
						subject='The logo'
						currentUrl={currentLogo}
						onFileChange={handleLogoChange}
						disabled={isSubmitting}
						previewAlt={blob ? 'Team logo preview' : 'Current team logo'}
						emptyLabel='No logo'
					/>

					<div className='pt-2'>
						<LoadingButton
							type='submit'
							className='w-full'
							loading={isSubmitting}
							loadingText='Updating Team...'
						>
							Save Changes
						</LoadingButton>
					</div>
				</form>
			</Form>
		</div>
	)
}
