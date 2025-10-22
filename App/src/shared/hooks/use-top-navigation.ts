import { useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
	useAuthContext,
	useOffersContext,
	useSeasonsContext,
} from '@/providers'
import { logger } from '@/shared/utils'
import { useResponsiveDrawer } from '@/shared/hooks'
import type { PlayerSeason } from '@/types'

/**
 * Custom hook for navigation logic
 * Centralizes navigation state and user permission logic
 */
export const useTopNavigation = () => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		signOut,
		signOutLoading,
		signOutError,
	} = useAuthContext()
	const { incomingOffersQuerySnapshot } = useOffersContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	// Use the responsive drawer hook for mobile navigation
	const {
		isDrawerOpen: isMobileNavOpen,
		setDrawerOpen: setIsMobileNavOpen,
		closeDrawer: closeMobileNav,
		closeDrawerWithAction: closeMobileNavWithAction,
	} = useResponsiveDrawer(false)

	const pendingOffersCount = useMemo(
		() => incomingOffersQuerySnapshot?.docs.length,
		[incomingOffersQuerySnapshot]
	)

	const isAuthenticatedUserPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid ?? false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserSigned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed ?? false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin ?? false,
		[authenticatedUserSnapshot]
	)

	// Count of required tasks for profile completion
	const requiredTasksCount = useMemo(() => {
		if (!authStateUser) return 0

		let count = 0

		// Email verification required
		if (!authStateUser.emailVerified) {
			count++
		}

		// Payment required
		if (isAuthenticatedUserPaid === false) {
			count++
		}

		// Waiver signature required
		if (isAuthenticatedUserSigned === false) {
			count++
		}

		return count
	}, [authStateUser, isAuthenticatedUserPaid, isAuthenticatedUserSigned])

	// Navigation content configuration
	const navContent = [
		{ label: 'Home', path: '/', alt: 'home page' },
		{ label: 'Schedule', path: '/schedule', alt: 'league schedule' },
		{ label: 'Standings', path: '/standings', alt: 'league standings' },
		{ label: 'Teams', path: '/teams', alt: 'team list' },
		{
			label: 'Player Rankings',
			path: '/player-rankings',
			alt: 'player rankings',
		},
		{ label: 'News', path: '/news', alt: 'league news and announcements' },
	]

	const adminContent = [
		{ label: 'Dashboard', path: '/admin', alt: 'admin dashboard' },
	]

	const userContent = [
		{ label: 'Profile', path: '/profile', alt: 'user profile' },
		{ label: 'Team Management', path: '/manage', alt: 'team management' },
	]

	const handleSignOut = useCallback(async () => {
		// Prevent multiple sign-out attempts while already processing
		if (signOutLoading) {
			return
		}

		try {
			const success = await signOut()
			if (success) {
				logger.userAction('sign_out_success', 'Layout', {
					userId: authStateUser?.uid,
				})
				toast.success('Logged Out', {
					description: 'You are no longer signed in to an account.',
				})
			} else {
				// Handle case where signOut returns false but doesn't throw
				const errorMessage = signOutError?.message || 'Please try again later.'
				toast.error('Unable to Log Out', {
					description: errorMessage,
				})
			}
		} catch (error) {
			logger.error(
				'Log out failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'Layout',
					userId: authStateUser?.uid,
				}
			)
			toast.error('Unable to Log Out', {
				description: 'An unexpected error occurred.',
			})
		}
	}, [signOut, signOutLoading, signOutError, authStateUser])

	const handleMobileLogin = useCallback(
		(onLoginClick: () => void) => {
			closeMobileNavWithAction(onLoginClick)
		},
		[closeMobileNavWithAction]
	)

	return {
		// State
		authStateUser,
		authStateLoading,
		signOutLoading,
		isMobileNavOpen,
		pendingOffersCount,
		requiredTasksCount,
		isAuthenticatedUserAdmin,

		// Content
		navContent,
		userContent,
		adminContent,

		// Actions
		setIsMobileNavOpen,
		handleCloseMobileNav: closeMobileNav,
		handleSignOut,
		handleMobileLogin,
	}
}
