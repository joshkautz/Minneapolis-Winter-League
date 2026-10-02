import { LoadingButton } from '@/shared/components'
import { Card, CardContent } from '@/components/ui/card'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSignupForm } from './use-signup-form'
import { errorMessage, LEAGUE_CONTACT } from '@/shared/utils'
import { PROFANE_NAME_MESSAGE } from '@/shared/utils/validation'

interface SignupFormProps {
	onSuccess: () => void
}

/** Creates an account: name, email and password, validated as typed. */
export const SignupForm = ({ onSuccess }: SignupFormProps) => {
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

	// The filter refuses some real names. An admin can set any name, so say
	// who to ask rather than leave the player stuck.
	const nameRefused = [
		form.formState.errors.firstName?.message,
		form.formState.errors.lastName?.message,
	].includes(PROFANE_NAME_MESSAGE)

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
						<LoadingButton
							type='submit'
							className='w-full'
							loading={isLoading}
							loadingText='Signing Up...'
						>
							Sign Up
						</LoadingButton>
						{error && (
							<p className='text-sm text-red-500 text-center'>
								{errorMessage(
									error,
									'Your account could not be created. Please try again.'
								)}
							</p>
						)}
					</form>
				</Form>
				{nameRefused && (
					<p className='text-center text-sm text-muted-foreground'>
						Our content filter flagged your name. If it is your real name, email{' '}
						{LEAGUE_CONTACT} and we will set it for you.
					</p>
				)}
			</CardContent>
		</Card>
	)
}
