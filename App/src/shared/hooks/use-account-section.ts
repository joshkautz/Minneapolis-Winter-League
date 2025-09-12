import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { errorHandler, logger } from '@/shared/utils'

const getInitials = (
	firstName: string | undefined,
	lastName: string | undefined
) => {
	if (!firstName || !lastName) {
		return 'NA'
	}
	return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export const useAccountSection = () => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		signOut,
		signOutLoading,
	} = useAuthContext()

	const userInitials = useMemo(() => {
		if (!authenticatedUserSnapshot) {
			return 'NA'
		}
		const data = authenticatedUserSnapshot.data()
		return getInitials(data?.firstname, data?.lastname)
	}, [authenticatedUserSnapshot])

	const isLoading = useMemo(
		() =>
			(!authStateUser && authStateLoading) ||
			(authStateUser && !authenticatedUserSnapshot),
		[authStateUser, authStateLoading, authenticatedUserSnapshot]
	)

	const handleSignOut = async () => {
		try {
			const success = await signOut()
			if (success) {
				toast.success('Logged out successfully', {
					description: 'You have been signed out of your account.',
				})
			} else {
				toast.error('Failed to log out', {
					description: 'Please try again.',
				})
			}
		} catch (error) {
			logger.error(
				'Log out failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'UserAvatar',
					userId: authStateUser?.uid,
				}
			)
			errorHandler.handleAuth(error, 'sign_out', {
				fallbackMessage: 'An unexpected error occurred while signing out',
			})
		}
	}

	return {
		authStateUser,
		userInitials,
		isLoading,
		signOutLoading,
		handleSignOut,
	}
}
