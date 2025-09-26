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
import { StorageReference } from '@/firebase/storage'
import { useCreateTeamForm } from '@/features/create/hooks'
import type { TeamCreationData } from '@/features/create/hooks/use-team-creation'

interface CreateFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
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
	uploadFile?: (
		ref: StorageReference,
		blob: Blob,
		metadata: { contentType: string }
	) => Promise<{ ref: StorageReference } | undefined>
}

export const CreateTeamForm = ({
	isSubmitting,
	setIsSubmitting,
	setNewTeamDocument,
	handleResult,
	uploadFile,
}: CreateFormProps) => {
	// Provide a no-op uploadFile function if not provided since this form doesn't handle file uploads
	const defaultUploadFile = async () => undefined

	const { form, onSubmit } = useCreateTeamForm({
		isSubmitting,
		setIsSubmitting,
		setNewTeamDocument,
		handleResult,
		uploadFile: uploadFile || defaultUploadFile,
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

					<div className='pt-2'>
						<Button
							type='submit'
							disabled={isSubmitting}
							className='w-full h-11'
							size='lg'
						>
							{isSubmitting ? 'Creating Team...' : 'Create Team'}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	)
}
