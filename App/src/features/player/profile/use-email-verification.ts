import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { sendVerificationEmailViaFunction } from '@/firebase/collections/functions'
import { logger, errorMessage, formatKickoffTime } from '@/shared/utils'

interface UseEmailVerificationProps {
	isAuthenticatedUserBanned: boolean
}

/**
 * Sends the player another email to confirm their address. The league sends
 * it (`sendVerificationEmail`), not Firebase, at most once in ten minutes;
 * a press inside that says when the last one went instead of sending more.
 */
export const useEmailVerification = ({
	isAuthenticatedUserBanned,
}: UseEmailVerificationProps) => {
	const { authStateUser, refreshUser } = useAuthContext()
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<Error | undefined>(undefined)
	const [verificationEmailSent, setVerificationEmailSent] = useState(false)

	const handleSendVerification = useCallback(async () => {
		if (isLoading || isAuthenticatedUserBanned) return
		setIsLoading(true)
		setError(undefined)
		try {
			const { alreadyVerified, sent, lastSentAt, nextAllowedAt } =
				await sendVerificationEmailViaFunction()
			if (alreadyVerified) {
				// Confirmed in another tab or on another device: catch up now
				// rather than at the next periodic refresh.
				await refreshUser()
				toast.success('Your email is already confirmed.')
				return
			}
			setVerificationEmailSent(true)
			if (!sent && lastSentAt && nextAllowedAt) {
				toast.info('A verification email is already on its way', {
					description: `We sent one at ${formatKickoffTime(new Date(lastSentAt))}. Check your spam folder if it isn’t in your inbox. You can ask for another after ${formatKickoffTime(new Date(nextAllowedAt))}.`,
				})
				return
			}
			toast.success('Verification email sent!', {
				description:
					'Check your inbox for the link. It can take a minute to arrive.',
			})
			logger.userAction('email_verification_sent', 'EmailVerificationSection', {
				userId: authStateUser?.uid,
			})
		} catch (sendError) {
			setError(
				sendError instanceof Error ? sendError : new Error(String(sendError))
			)
			logger.error('Email verification failed', sendError, {
				component: 'EmailVerificationSection',
				userId: authStateUser?.uid,
			})
			toast.error('Failed to send verification email', {
				description: errorMessage(
					sendError,
					'The verification email could not be sent. Please try again later.'
				),
			})
		} finally {
			setIsLoading(false)
		}
	}, [isLoading, isAuthenticatedUserBanned, refreshUser, authStateUser])

	return {
		handleSendVerification,
		isLoading,
		error,
		verificationEmailSent,
	}
}
