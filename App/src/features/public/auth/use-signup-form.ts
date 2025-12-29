import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { useAuthContext } from '@/providers'
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
		sendEmailVerificationSending,
		sendEmailVerificationError,
	} = useAuthContext()

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
		if (createUserWithEmailAndPasswordLoading || sendEmailVerificationSending) {
			return
		}

		logger.userAction('signup_initiated', 'SignupForm', {
			firstName: data.firstName,
			lastName: data.lastName,
			email: data.email,
		})

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
				const emailVerificationSent = await sendEmailVerification()

				if (emailVerificationSent) {
					logger.userAction('email_verification_sent', 'SignupForm', {
						userId: credential.user.uid,
					})
				} else {
					logger.error(
						'Email verification failed',
						sendEmailVerificationError,
						{
							component: 'SignupForm',
							action: 'email_verification',
							userId: credential.user.uid,
						}
					)
					toast.error(
						'Account created but failed to send verification email. Please try again from your profile.'
					)
				}

				// Create player document
				try {
					await createPlayerViaFunction({
						firstname: data.firstName,
						lastname: data.lastName,
						email: data.email,
					})

					logger.firebase('create', 'players', undefined, {
						userId: credential.user.uid,
						success: true,
					})
				} catch (playerCreationError) {
					logger.firebase(
						'create',
						'players',
						playerCreationError instanceof Error
							? playerCreationError
							: new Error(String(playerCreationError)),
						{
							userId: credential.user.uid,
							success: false,
						}
					)
					// Don't throw here - account was created successfully even if player doc failed
					// The user can still use their account, and this can be retried later
					logger.error('Player document creation failed:', playerCreationError)
				}

				// Log successful completion of entire signup process
				logger.userAction('signup_completed', 'SignupForm', {
					userId: credential.user.uid,
					email: data.email,
				})
			}
		} catch (error) {
			logger.auth(
				'sign_up',
				false,
				error instanceof Error ? error : new Error(String(error))
			)
			logger.error('Signup error:', error)
			toast.error('Failed to create account. Please try again.')
		}
	}

	// Handle successful account creation
	// The key insight: only handle success when the form was actually submitted successfully
	useEffect(() => {
		if (
			createUserWithEmailAndPasswordUser?.user &&
			form.formState.isSubmitSuccessful &&
			!createUserWithEmailAndPasswordError &&
			!createUserWithEmailAndPasswordLoading
		) {
			toast.success('Account created successfully! Please verify your email.')
			onSuccess()
		}
	}, [
		createUserWithEmailAndPasswordUser,
		form.formState.isSubmitSuccessful,
		createUserWithEmailAndPasswordError,
		createUserWithEmailAndPasswordLoading,
		onSuccess,
	])

	// Combine form submission state with Firebase authentication state for comprehensive loading
	const isLoading =
		form.formState.isSubmitting ||
		createUserWithEmailAndPasswordLoading ||
		sendEmailVerificationSending

	return {
		form,
		onSubmit,
		isLoading,
		error: createUserWithEmailAndPasswordError || sendEmailVerificationError,
		signupFormSchema,
	}
}
