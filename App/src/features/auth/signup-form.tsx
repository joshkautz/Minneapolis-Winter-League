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
import { useSignupForm } from './use-signup-form'

interface SignupFormProps {
	onSuccess: () => void
}

/**
 * Signup Form Component
 *
 * Provides user registration functionality with form validation.
 * Refactored to use custom hook for better separation of concerns.
 */
export const SignupForm = ({ onSuccess }: SignupFormProps) => {
	const { form, onSubmit, isLoading, error } = useSignupForm({ onSuccess })

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign up</CardTitle>
				<CardDescription>Create a new account</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="firstName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>First name</FormLabel>
										<FormControl>
											<Input placeholder="Max" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="lastName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Last name</FormLabel>
										<FormControl>
											<Input placeholder="Robinson" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input type="email" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input type="password" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? 'Creating account...' : 'Create account'}
						</Button>
						{error && (
							<p className="text-sm text-red-500 text-center">
								{error.message || 'An error occurred during signup'}
							</p>
						)}
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
