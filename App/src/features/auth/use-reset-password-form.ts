import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { useAuthContext } from '@/providers'
import { errorHandler, logger } from '@/shared/utils'
import {
	resetPasswordFormSchema,
	type ResetPasswordFormData,
} from '@/shared/utils/validation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'

export type { ResetPasswordFormData } from '@/shared/utils/validation'

interface UseResetPasswordFormProps {
	onSuccess: () => void
}

/**
 * Custom hook for reset password form logic
 *
 * Encapsulates form validation, submission logic, and error handling
 * for the password reset process.
 */
export const useResetPasswordForm = ({
	onSuccess,
}: UseResetPasswordFormProps) => {
	const {
		sendPasswordResetEmail,
		sendPasswordResetEmailError,
		sendPasswordResetEmailSending,
	} = useAuthContext()

	const form = useForm<ResetPasswordFormData>({
		resolver: standardSchemaResolver(resetPasswordFormSchema),
		defaultValues: {
			email: '',
		},
	})

	const onSubmit = async (data: ResetPasswordFormData) => {
		// Prevent multiple submissions while already processing
		if (sendPasswordResetEmailSending) {
			return
		}

		try {
			const result = await sendPasswordResetEmail(data.email)

			if (result) {
				logger.userAction('password_reset_email_sent', 'ResetPasswordForm', {
					email: data.email,
				})
			}
		} catch (error) {
			logger.error(
				'Password reset failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ResetPasswordForm',
					email: data.email,
				}
			)
			errorHandler.handleAuth(error, 'password_reset', {
				fallbackMessage:
					'An unexpected error occurred while sending reset email',
			})
		}
	}

	// Handle successful password reset email sending
	useEffect(() => {
		// Check if the form was submitted and no error occurred
		if (
			form.formState.isSubmitSuccessful &&
			!sendPasswordResetEmailError &&
			!sendPasswordResetEmailSending
		) {
			toast.success('Password reset email sent!', {
				description:
					'Check your inbox for instructions to reset your password.',
			})
			onSuccess()
		}
	}, [
		form.formState.isSubmitSuccessful,
		sendPasswordResetEmailError,
		sendPasswordResetEmailSending,
		onSuccess,
	])

	// Handle errors
	useEffect(() => {
		if (sendPasswordResetEmailError && form.formState.isSubmitted) {
			toast.error('Failed to send reset email', {
				description: sendPasswordResetEmailError?.message || 'Please try again',
			})
		}
	}, [sendPasswordResetEmailError, form.formState.isSubmitted])

	// Combine form submission state with Firebase state for comprehensive loading
	const isLoading = form.formState.isSubmitting || sendPasswordResetEmailSending

	return {
		form,
		onSubmit,
		isLoading,
		error: sendPasswordResetEmailError,
		resetPasswordFormSchema,
	}
}
