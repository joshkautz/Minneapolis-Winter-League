import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'

const loginSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: z.string().min(1, 'Password is required'),
})

export type LoginFormData = z.infer<typeof loginSchema>

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

	const form = useForm<LoginFormData>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	})

	const onSubmit = async (data: LoginFormData) => {
		try {
			const result = await signInWithEmailAndPassword(data.email, data.password)

			if (result?.user) {
				toast.success('Successfully logged in!')
				onSuccess()
			}
		} catch (error) {
			console.error('Login error:', error)
			toast.error('Failed to log in. Please try again.')
		}
	}

	return {
		form,
		onSubmit,
		isLoading: form.formState.isSubmitting,
		error: signInWithEmailAndPasswordError,
		loginSchema,
	}
}
