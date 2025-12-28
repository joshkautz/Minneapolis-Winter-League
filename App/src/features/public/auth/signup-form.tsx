import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSignupForm } from '@/features/public/auth'

interface SignupFormProps {
	onSuccess: () => void
	onNameAppeal?: (data: {
		firstName: string
		lastName: string
		email: string
	}) => void
}

/**
 * Signup Form Component
 *
 * Provides user registration functionality with form validation.
 * Refactored to use custom hook for better separation of concerns.
 */
export const SignupForm = ({ onSuccess, onNameAppeal }: SignupFormProps) => {
	const { form, onSubmit, isLoading, error } = useSignupForm({ onSuccess })

	// Collect all validation error messages in field order with field labels
	const fieldOrder = [
		{ name: 'firstName', label: 'First name' },
		{ name: 'lastName', label: 'Last name' },
		{ name: 'email', label: 'Email' },
		{ name: 'password', label: 'Password' },
	] as const
	const validationErrors = fieldOrder
		.map((field) => {
			const error = form.formState.errors[field.name]?.message
			return error ? `${field.label}: ${error}` : null
		})
		.filter(Boolean)

	// Check if there are profanity-related validation errors
	const firstNameError = form.formState.errors.firstName?.message
	const lastNameError = form.formState.errors.lastName?.message
	const hasProfanityError =
		firstNameError?.includes('inappropriate language') ||
		lastNameError?.includes('inappropriate language')

	const handleAppeal = () => {
		if (onNameAppeal) {
			const formData = form.getValues()
			onNameAppeal({
				firstName: formData.firstName,
				lastName: formData.lastName,
				email: formData.email,
			})
		}
	}

	return (
		<Card>
			<CardContent className='space-y-4'>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						<FormField
							control={form.control}
							name='firstName'
							render={({ field }) => (
								<FormItem>
									<FormLabel>First name</FormLabel>
									<FormControl>
										<Input {...field} data-1p-ignore />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='lastName'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Last name</FormLabel>
									<FormControl>
										<Input {...field} data-1p-ignore />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='email'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input type='email' {...field} data-1p-ignore />
									</FormControl>
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
										<Input
											type='password'
											{...field}
											data-1p-ignore
											aria-describedby='password-requirements'
										/>
									</FormControl>
									<p
										id='password-requirements'
										className='text-xs text-muted-foreground'
									>
										Must be at least 6 characters
									</p>
								</FormItem>
							)}
						/>
						{/* Centralized validation errors */}
						{validationErrors.length > 0 && (
							<div
								className='bg-red-50 border border-red-200 rounded-md p-3'
								role='alert'
								aria-live='polite'
							>
								<ul className='text-sm text-red-600 space-y-1'>
									{validationErrors.map((error) => (
										<li key={error} className='flex items-start'>
											<span className='mr-2' aria-hidden='true'>
												•
											</span>
											<span>{error}</span>
										</li>
									))}
								</ul>
							</div>
						)}
						<Button type='submit' className='w-full' disabled={isLoading}>
							{isLoading ? 'Signing Up...' : 'Sign Up'}
						</Button>
						{error && (
							<p className='text-sm text-red-500 text-center'>
								{error.message || 'An error occurred during signup'}
							</p>
						)}
					</form>
				</Form>
				{hasProfanityError && onNameAppeal && (
					<div className='text-center text-sm'>
						<p className='text-muted-foreground mb-2'>
							Your name was flagged by our content filter. If you believe this
							is an error, you can submit an appeal.
						</p>
						<Button
							variant='link'
							onClick={handleAppeal}
							className='px-0 underline'
						>
							Submit Appeal
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
