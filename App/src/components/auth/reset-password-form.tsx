import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useAuthContext } from '@/contexts/auth-context'
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

const resetPasswordSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

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
		resolver: zodResolver(resetPasswordSchema),
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
			toast.error('Failed to send reset email', {
				description: 'An unexpected error occurred',
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
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input
											type="email"
											placeholder="Enter your email"
											autoComplete="email"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="space-y-2">
							<Button
								type="submit"
								className="w-full"
								disabled={form.formState.isSubmitting}
							>
								{form.formState.isSubmitting
									? 'Sending...'
									: 'Send reset email'}
							</Button>
							<Button
								type="button"
								variant="outline"
								className="w-full"
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
