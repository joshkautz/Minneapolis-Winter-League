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
import { useCreateTeamForm } from '@/features/create/hooks'

interface CreateFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<
			| {
					name: string | undefined
					storageRef: any | undefined // Using any for StorageReference to avoid import complexity
					teamId: string | undefined
			  }
			| undefined
		>
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
		ref: any,
		blob: Blob,
		metadata: { contentType: string }
	) => Promise<{ ref: any } | undefined>
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
		<div className='max-w-[400px]'>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className={'w-full space-y-6'}
				>
					<FormField
						control={form.control}
						name={'name'}
						render={({ field }) => (
							<FormItem>
								<FormLabel>Team name</FormLabel>
								<FormControl>
									<Input
										placeholder={'Team name'}
										{...field}
										value={field.value ?? ''}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type={'submit'} disabled={isSubmitting || true}>
						Create
					</Button>
					<p
						className={'text-[0.8rem] text-muted-foreground mt-2 text-red-500'}
					>
						The maximum number of fully registered teams for the current season
						has been reached.
					</p>
				</form>
			</Form>
		</div>
	)
}
