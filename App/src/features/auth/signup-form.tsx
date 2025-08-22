import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { createPlayer } from '@/firebase/firestore'
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

const signupSchema = z.object({
	firstName: z.string().min(2, 'First name must be at least 2 characters'),
	lastName: z.string().min(2, 'Last name must be at least 2 characters'),
	email: z.string().email('Please enter a valid email address'),
	password: z.string().min(6, 'Password must be at least 6 characters'),
})

type SignupFormData = z.infer<typeof signupSchema>

interface SignupFormProps {
	onSuccess: () => void
}

export const SignupForm = ({ onSuccess }: SignupFormProps) => {
	const {
		createUserWithEmailAndPassword,
		createUserWithEmailAndPasswordError,
		sendEmailVerification,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const form = useForm<SignupFormData>({
		resolver: zodResolver(signupSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
		},
	})

	const onSubmit = async (data: SignupFormData) => {
		try {
			const result = await createUserWithEmailAndPassword(
				data.email,
				data.password
			)

			if (result?.user) {
				// Send email verification and create player profile
				await Promise.all([
					sendEmailVerification(),
					createPlayer(
						result,
						data.firstName,
						data.lastName,
						data.email,
						currentSeasonQueryDocumentSnapshot
					),
				])

				toast.success('Account created successfully!', {
					description:
						'Welcome to Minneapolis Winter League! Please check your email to verify your account.',
				})
				onSuccess()
			} else {
				toast.error('Signup failed', {
					description:
						createUserWithEmailAndPasswordError?.message ||
						'Failed to create account',
				})
			}
		} catch (error) {
			toast.error('Signup failed', {
				description: 'An unexpected error occurred',
			})
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign up</CardTitle>
				<CardDescription>Create a new account</CardDescription>
			</CardHeader>
			<CardContent>
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
											<Input
												placeholder="First name"
												autoComplete="given-name"
												{...field}
											/>
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
											<Input
												placeholder="Last name"
												autoComplete="family-name"
												{...field}
											/>
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
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder="Create a password"
											autoComplete="new-password"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button
							type="submit"
							className="w-full"
							disabled={form.formState.isSubmitting}
						>
							{form.formState.isSubmitting
								? 'Creating account...'
								: 'Create account'}
						</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
