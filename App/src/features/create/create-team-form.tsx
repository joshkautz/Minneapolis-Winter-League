import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { errorHandler, logger, ErrorType } from '@/shared/utils'
import { TeamFormData } from '@/shared/utils/validation'

interface CreateFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<
			| {
					name: string | undefined
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
}

export const CreateTeamForm = ({
	isSubmitting,
	setIsSubmitting,
	setNewTeamDocument,
	handleResult,
}: CreateFormProps) => {
	const form = useForm<TeamFormData>({
		defaultValues: {
			name: '',
			logo: '',
		},
	})

	const onCreateSubmit = useCallback(
		async (data: TeamFormData) => {
			try {
				setIsSubmitting(true)
				setNewTeamDocument({
					name: data.name,
					teamId: undefined,
				})
			} catch (error) {
				logger.error(
					'Team creation failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'CreateTeamForm',
						teamName: data.name,
					}
				)
				errorHandler.handle(
					error,
					ErrorType.UNEXPECTED,
					'CreateTeamForm.onCreateSubmit'
				)
				handleResult({
					success: false,
					title: 'Creation failed',
					description: 'Something went wrong. Please try again.',
					navigation: false,
				})
			} finally {
				setIsSubmitting(false)
			}
		},
		[setNewTeamDocument, handleResult, setIsSubmitting]
	)

	return (
		<div className='max-w-[400px]'>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onCreateSubmit)}
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
