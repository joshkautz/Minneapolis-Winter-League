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
import { useLoginForm } from './use-login-form'

interface LoginFormProps {
	onSuccess: () => void
	onForgotPassword: () => void
}

/**
 * Login Form Component
 *
 * Provides user authentication functionality with form validation.
 * Refactored to use custom hook for better separation of concerns.
 */
export const LoginForm = ({ onSuccess, onForgotPassword }: LoginFormProps) => {
	const { form, onSubmit, isLoading, error } = useLoginForm({ onSuccess })

	return (
		<Card>
			<CardContent className='space-y-4'>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						<FormField
							control={form.control}
							name='email'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input type='email' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='password'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input type='password' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type='submit' className='w-full' disabled={isLoading}>
							{isLoading ? 'Logging in...' : 'Log in'}
						</Button>
						{error && (
							<p className='text-sm text-red-500 text-center'>
								{error.message || 'An error occurred during login'}
							</p>
						)}
					</form>
				</Form>
				<div className='text-center text-sm'>
					<Button
						variant='link'
						onClick={onForgotPassword}
						className='px-0 underline'
					>
						Forgot your password?
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
