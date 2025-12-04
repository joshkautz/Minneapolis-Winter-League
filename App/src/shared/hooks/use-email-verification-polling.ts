import { useEffect } from 'react'
import { useAuthContext } from '@/providers'

/**
 * Hook to handle email verification polling
 *
 * Automatically polls for email verification status and refreshes
 * the user's auth token when verification is detected.
 *
 * This logic is extracted from App.tsx to separate concerns and
 * make it reusable across the application if needed.
 */
export function useEmailVerificationPolling() {
	const { authStateUser } = useAuthContext()

	useEffect(() => {
		// Don't start polling if no user or user is already verified
		if (!authStateUser || authStateUser.emailVerified) {
			return
		}

		const interval = setInterval(() => {
			authStateUser.reload().then(() => {
				if (authStateUser.emailVerified) {
					// Force token refresh to get updated claims
					authStateUser.getIdToken(true)
					// Stop polling once verified
					clearInterval(interval)
				}
			})
		}, 2000)

		// Cleanup on unmount or dependency change
		return () => {
			clearInterval(interval)
		}
	}, [authStateUser])
}
