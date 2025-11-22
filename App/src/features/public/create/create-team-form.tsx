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

import { useCreateTeamForm } from '@/features/public/create/hooks'
import type { TeamCreationData } from '@/features/public/create/hooks/use-team-creation'

interface CreateFormProps {
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
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
	seasonId: string
	isTeamRegistrationFull?: boolean
}

export const CreateTeamForm = ({
	setNewTeamDocument,
	handleResult,
	seasonId,
	isTeamRegistrationFull = false,
}: CreateFormProps) => {
	const { form, onSubmit, handleFileChange, isSubmitting } = useCreateTeamForm({
		setNewTeamDocument,
		handleResult,
		seasonId,
	})

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
										placeholder='Enter your team name'
										className='h-11'
										autoComplete='off'
										autoFocus
										disabled={isTeamRegistrationFull}
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
						<label htmlFor='team-logo-upload' className='text-sm font-medium'>
							Team Logo (Optional)
						</label>
						<Input
							id='team-logo-upload'
							type='file'
							accept='image/*'
							onChange={handleFileChange}
							className='h-11'
							disabled={isSubmitting || isTeamRegistrationFull}
						/>
					</div>

					<div className='pt-2'>
						<Button
							type='submit'
							disabled={isSubmitting || isTeamRegistrationFull}
							className='w-full h-11'
							size='lg'
						>
							{isSubmitting ? 'Creating New Team...' : 'Create New Team'}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	)
}
