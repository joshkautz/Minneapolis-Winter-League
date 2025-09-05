import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { useAuthContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { createPlayerViaFunction } from '@/firebase/collections/functions'
import { logger } from '@/shared/utils'
import {
	signupFormSchema,
	type SignupFormData,
} from '@/shared/utils/validation'

export type { SignupFormData } from '@/shared/utils/validation'

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
		createUserWithEmailAndPasswordLoading,
		createUserWithEmailAndPasswordUser,
		sendEmailVerification,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const form = useForm<SignupFormData>({
		resolver: standardSchemaResolver(signupFormSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
		},
	})

	const onSubmit = async (data: SignupFormData) => {
		// Prevent multiple submissions while already processing
		if (createUserWithEmailAndPasswordLoading) {
			return
		}

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
					lastName: data.lastName,
				})

				// Send email verification
				sendEmailVerification()

				// Create player document
				await createPlayerViaFunction({
					firstname: data.firstName,
					lastname: data.lastName,
					email: data.email,
					seasonId: currentSeasonQueryDocumentSnapshot?.id || '',
				})

				logger.firebase('create', 'players', undefined, {
					userId: credential.user.uid,
				})
			}
		} catch (error) {
			logger.auth(
				'sign_up',
				false,
				error instanceof Error ? error : new Error(String(error))
			)
			console.error('Signup error:', error)
			toast.error('Failed to create account. Please try again.')
		}
	}

	// Handle successful account creation
	useEffect(() => {
		if (createUserWithEmailAndPasswordUser?.user) {
			toast.success('Account created successfully! Please verify your email.')
			onSuccess()
		}
	}, [createUserWithEmailAndPasswordUser, onSuccess])

	// Combine form submission state with Firebase authentication state for comprehensive loading
	const isLoading =
		form.formState.isSubmitting || createUserWithEmailAndPasswordLoading

	return {
		form,
		onSubmit,
		isLoading,
		error: createUserWithEmailAndPasswordError,
		signupFormSchema,
	}
}
