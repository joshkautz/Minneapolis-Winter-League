import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { useAuthContext } from '@/providers'
import { logger } from '@/shared/utils'
import { loginFormSchema, type LoginFormData } from '@/shared/utils/validation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'

export type { LoginFormData } from '@/shared/utils/validation'

interface UseLoginFormProps {
	onSuccess: () => void
}

/**
 * Custom hook for login form logic
 *
 * Encapsulates form validation, submission logic, and error handling
 * for the user login process.
 */
export const useLoginForm = ({ onSuccess }: UseLoginFormProps) => {
	const {
		signInWithEmailAndPassword,
		signInWithEmailAndPasswordError,
		signInWithEmailAndPasswordLoading,
		signInWithEmailAndPasswordUser,
	} = useAuthContext()

	const form = useForm<LoginFormData>({
		resolver: standardSchemaResolver(loginFormSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	})

	const onSubmit = async (data: LoginFormData) => {
		// Prevent multiple submissions while already processing
		if (signInWithEmailAndPasswordLoading) {
			return
		}

		try {
			const result = await signInWithEmailAndPassword(data.email, data.password)

			if (result?.user) {
				logger.auth('sign_in', true, undefined, result.user.uid)
				logger.userAction('login_success', 'LoginForm', { email: data.email })
			}
		} catch (error) {
			logger.auth(
				'sign_in',
				false,
				error instanceof Error ? error : new Error(String(error))
			)
			logger.error('Login error:', error)
			toast.error('Failed to log in. Please try again.')
		}
	}

	// Handle successful authentication
	// The key insight: only handle success when the form was actually submitted successfully
	useEffect(() => {
		if (
			signInWithEmailAndPasswordUser?.user &&
			form.formState.isSubmitSuccessful &&
			!signInWithEmailAndPasswordError &&
			!signInWithEmailAndPasswordLoading
		) {
			toast.success('Successfully logged in!')
			onSuccess()
		}
	}, [
		signInWithEmailAndPasswordUser,
		form.formState.isSubmitSuccessful,
		signInWithEmailAndPasswordError,
		signInWithEmailAndPasswordLoading,
		onSuccess,
	])

	// Combine form submission state with Firebase authentication state for comprehensive loading
	const isLoading =
		form.formState.isSubmitting || signInWithEmailAndPasswordLoading

	return {
		form,
		onSubmit,
		isLoading,
		error: signInWithEmailAndPasswordError,
		loginFormSchema,
	}
}
