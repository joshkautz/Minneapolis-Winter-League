import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { errorHandler, logger } from '@/shared/utils'
import {
	resetPasswordFormSchema,
	type ResetPasswordFormData,
} from '@/shared/utils/validation'

interface ResetPasswordFormProps {
	onSuccess: () => void
	onBack: () => void
}

export const ResetPasswordForm = ({
	onSuccess,
	onBack,
}: ResetPasswordFormProps) => {
	const { sendPasswordResetEmail, sendPasswordResetEmailError } =
		useAuthContext()

	const form = useForm<ResetPasswordFormData>({
		resolver: standardSchemaResolver(resetPasswordFormSchema),
		defaultValues: {
			email: '',
		},
	})

	const onSubmit = async (data: ResetPasswordFormData) => {
		try {
			const result = await sendPasswordResetEmail(data.email)

			if (result) {
				toast.success('Password reset email sent!', {
					description:
						'Check your inbox for instructions to reset your password.',
				})
				onSuccess()
			} else {
				toast.error('Failed to send reset email', {
					description:
						sendPasswordResetEmailError?.message || 'Please try again',
				})
			}
		} catch (error) {
			logger.error(
				'Password reset failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ResetPasswordForm',
					email: data.email,
				}
			)
			errorHandler.handleAuth(error, 'password_reset', {
				fallbackMessage:
					'An unexpected error occurred while sending reset email',
			})
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Reset Password</CardTitle>
				<CardDescription>
					Enter your email address and we'll send you a link to reset your
					password.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						<FormField
							control={form.control}
							name='email'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input
											type='email'
											placeholder='Enter your email'
											autoComplete='email'
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className='space-y-2'>
							<Button
								type='submit'
								className='w-full'
								disabled={form.formState.isSubmitting}
							>
								{form.formState.isSubmitting
									? 'Sending...'
									: 'Send reset email'}
							</Button>
							<Button
								type='button'
								variant='outline'
								className='w-full'
								onClick={onBack}
							>
								Back to login
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
