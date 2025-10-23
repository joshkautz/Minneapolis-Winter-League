import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { logger } from '@/shared/utils'

interface UseEmailVerificationProps {
	isAuthenticatedUserBanned: boolean
}

/**
 * Custom hook for email verification logic
 *
 * Encapsulates email verification sending logic and error handling
 * with proper Firebase state management.
 */
export const useEmailVerification = ({
	isAuthenticatedUserBanned,
}: UseEmailVerificationProps) => {
	const {
		sendEmailVerification,
		sendEmailVerificationSending,
		sendEmailVerificationError,
		authStateUser,
	} = useAuthContext()

	const [verificationEmailSent, setVerificationEmailSent] = useState(false)
	const [wasRecentlySending, setWasRecentlySending] = useState(false)

	const handleSendVerification = useCallback(async () => {
		// Prevent multiple submissions while already processing
		if (sendEmailVerificationSending || isAuthenticatedUserBanned) {
			return
		}

		try {
			setVerificationEmailSent(false)
			const result = await sendEmailVerification()

			if (result) {
				logger.userAction(
					'email_verification_sent',
					'EmailVerificationSection',
					{
						userId: authStateUser?.uid,
					}
				)
			}
		} catch (error) {
			logger.error(
				'Email verification failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'EmailVerificationSection',
					userId: authStateUser?.uid,
				}
			)
			toast.error('Failed to send verification email', {
				description: 'Please try again later.',
			})
		}
	}, [
		sendEmailVerification,
		sendEmailVerificationSending,
		isAuthenticatedUserBanned,
		authStateUser,
	])

	// Track when we're sending
	useEffect(() => {
		if (sendEmailVerificationSending) {
			const timer = setTimeout(() => setWasRecentlySending(true), 0)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [sendEmailVerificationSending])

	// Handle successful verification email sent
	useEffect(() => {
		// If we were recently sending and now we're not, and there's no error
		if (
			wasRecentlySending &&
			!sendEmailVerificationSending &&
			!sendEmailVerificationError
		) {
			const timer = setTimeout(() => {
				setVerificationEmailSent(true)
				setWasRecentlySending(false)
			}, 0)
			toast.success('Verification email sent!', {
				description: 'Check your inbox for the verification link.',
			})
			return () => clearTimeout(timer)
		}
		return undefined
	}, [
		wasRecentlySending,
		sendEmailVerificationSending,
		sendEmailVerificationError,
	])

	// Handle errors
	useEffect(() => {
		if (sendEmailVerificationError) {
			toast.error('Failed to send verification email', {
				description:
					sendEmailVerificationError.message || 'Please try again later.',
			})
			const timer = setTimeout(() => {
				setVerificationEmailSent(false)
				setWasRecentlySending(false)
			}, 0)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [sendEmailVerificationError])

	return {
		handleSendVerification,
		isLoading: sendEmailVerificationSending,
		error: sendEmailVerificationError,
		verificationEmailSent,
	}
}
