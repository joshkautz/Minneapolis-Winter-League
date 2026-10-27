import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { requestPasswordResetViaFunction } from '@/firebase/collections/functions'
import { errorMessage, logger } from '@/shared/utils'
import {
	resetPasswordFormSchema,
	type ResetPasswordFormData,
} from '@/shared/utils/validation'

interface UseResetPasswordFormProps {
	onSuccess: () => void
}

/**
 * Asks the league to email a password-reset link (`requestPasswordReset`),
 * which it sends itself rather than through Firebase.
 *
 * The server answers the same whether or not an account uses the address,
 * so this says the same too: someone cannot learn here who has an account.
 */
export const useResetPasswordForm = ({
	onSuccess,
}: UseResetPasswordFormProps) => {
	const [error, setError] = useState<Error | undefined>(undefined)
	const form = useForm<ResetPasswordFormData>({
		resolver: standardSchemaResolver(resetPasswordFormSchema),
		defaultValues: { email: '' },
	})

	const onSubmit = async (data: ResetPasswordFormData) => {
		setError(undefined)
		try {
			await requestPasswordResetViaFunction({ email: data.email })
			logger.userAction('password_reset_requested', 'ResetPasswordForm')
			toast.success('Check your email', {
				description:
					'If an account uses that address, a link to choose a new password is on its way. It works for an hour.',
			})
			onSuccess()
		} catch (resetError) {
			setError(
				resetError instanceof Error ? resetError : new Error(String(resetError))
			)
			logger.error('Password reset failed', resetError, {
				component: 'ResetPasswordForm',
			})
			toast.error('Failed to send reset email', {
				description: errorMessage(
					resetError,
					'The reset email could not be sent. Please try again.'
				),
			})
		}
	}

	return {
		form,
		onSubmit,
		isLoading: form.formState.isSubmitting,
		error,
		resetPasswordFormSchema,
	}
}
