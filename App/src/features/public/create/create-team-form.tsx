import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ImageField, LoadingButton } from '@/shared/components'

import { useCreateTeamForm } from './hooks'
import type { TeamCreationResult } from './hooks/use-team-creation'

interface CreateFormProps {
	handleResult: (result: TeamCreationResult) => void
	seasonId: string
	isTeamRegistrationFull?: boolean
}

export const CreateTeamForm = ({
	handleResult,
	seasonId,
	isTeamRegistrationFull = false,
}: CreateFormProps) => {
	const { form, onSubmit, handleLogoChange, isSubmitting } = useCreateTeamForm({
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

					<ImageField
						label='Team Logo (Optional)'
						subject='The logo'
						onFileChange={handleLogoChange}
						disabled={isSubmitting || isTeamRegistrationFull}
						previewAlt='Team logo preview'
					/>

					<div className='pt-2'>
						<LoadingButton
							type='submit'
							disabled={isTeamRegistrationFull}
							className='w-full h-11'
							size='lg'
							loading={isSubmitting}
							loadingText='Creating New Team...'
						>
							Create New Team
						</LoadingButton>
					</div>
				</form>
			</Form>
		</div>
	)
}
