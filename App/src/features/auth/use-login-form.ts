import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
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
	const { signInWithEmailAndPassword, signInWithEmailAndPasswordError } =
		useAuthContext()

	const form = useForm({
		resolver: standardSchemaResolver(loginFormSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	})

	const onSubmit = async (data: LoginFormData) => {
		try {
			const result = await signInWithEmailAndPassword(data.email, data.password)

			if (result?.user) {
				logger.auth('sign_in', true, undefined, result.user.uid)
				logger.userAction('login_success', 'LoginForm', { email: data.email })
				toast.success('Successfully logged in!')
				onSuccess()
			}
		} catch (error) {
			logger.auth(
				'sign_in',
				false,
				error instanceof Error ? error : new Error(String(error))
			)
			console.error('Login error:', error)
			toast.error('Failed to log in. Please try again.')
		}
	}

	return {
		form,
		onSubmit,
		isLoading: form.formState.isSubmitting,
		error: signInWithEmailAndPasswordError,
		loginFormSchema,
	}
}
