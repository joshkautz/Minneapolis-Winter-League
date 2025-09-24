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
import { useResetPasswordForm } from './use-reset-password-form'

interface ResetPasswordFormProps {
	onSuccess: () => void
	onBack: () => void
}

export const ResetPasswordForm = ({
	onSuccess,
	onBack,
}: ResetPasswordFormProps) => {
	const { form, onSubmit, isLoading, error } = useResetPasswordForm({
		onSuccess,
	})

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
							<Button type='submit' className='w-full' disabled={isLoading}>
								{isLoading ? 'Sending...' : 'Send reset email'}
							</Button>
							{error && (
								<p className='text-sm text-red-500 text-center'>
									{error.message ||
										'An error occurred while sending reset email'}
								</p>
							)}
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
