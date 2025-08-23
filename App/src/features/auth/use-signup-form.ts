import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { createPlayer } from '@/firebase/firestore'
import { logger } from '@/shared/utils'

const signupSchema = z.object({
	firstName: z.string().min(2, 'First name must be at least 2 characters'),
	lastName: z.string().min(2, 'Last name must be at least 2 characters'),
	email: z.string().email('Please enter a valid email address'),
	password: z.string().min(6, 'Password must be at least 6 characters'),
})

export type SignupFormData = z.infer<typeof signupSchema>

interface UseSignupFormProps {
	onSuccess: () => void
}

/**
 * Custom hook for signup form logic
 * 
 * Encapsulates form validation, submission logic, and error handling
 * for the user signup process.
 */
export const useSignupForm = ({ onSuccess }: UseSignupFormProps) => {
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
			const credential = await createUserWithEmailAndPassword(
				data.email,
				data.password
			)

			if (credential?.user) {
				logger.auth('sign_up', true, undefined, credential.user.uid)
				logger.userAction('account_created', 'SignupForm', { 
					email: data.email,
					firstName: data.firstName,
					lastName: data.lastName
				})

				// Send email verification
				sendEmailVerification()

				// Create player document
				await createPlayer(
					credential,
					data.firstName,
					data.lastName,
					data.email,
					currentSeasonQueryDocumentSnapshot
				)

				logger.firebase('create', 'players', undefined, { userId: credential.user.uid })
				toast.success('Account created successfully! Please verify your email.')
				onSuccess()
			}
		} catch (error) {
			logger.auth('sign_up', false, error instanceof Error ? error : new Error(String(error)))
			console.error('Signup error:', error)
			toast.error('Failed to create account. Please try again.')
		}
	}

	return {
		form,
		onSubmit,
		isLoading: form.formState.isSubmitting,
		error: createUserWithEmailAndPasswordError,
		signupSchema,
	}
}
