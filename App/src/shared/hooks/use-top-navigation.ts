import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
	useAuthContext,
	useOffersContext,
	useSeasonsContext,
} from '@/providers'
import { logger } from '@/shared/utils'

/**
 * Custom hook for top navigation logic
 * Centralizes navigation state and user permission logic
 */
export const useTopNavigation = () => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		signOut,
		signOutLoading,
	} = useAuthContext()
	const { incomingOffersQuerySnapshot } = useOffersContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain || false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				) || false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasPendingOffers = useMemo(
		() => incomingOffersQuerySnapshot?.docs.length,
		[incomingOffersQuerySnapshot]
	)

	const isAuthenticatedUserPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid || false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserSigned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed || false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasRequiredTasks = useMemo(
		() =>
			isAuthenticatedUserPaid === false || isAuthenticatedUserSigned === false,
		[isAuthenticatedUserPaid, isAuthenticatedUserSigned]
	)

	// Navigation content configuration
	const navContent = [
		{ label: 'Home', path: '/#welcome', alt: 'home page' },
		{ label: 'Schedule', path: '/schedule', alt: 'league schedule' },
		{ label: 'Standings', path: '/standings', alt: 'league standings' },
		{ label: 'Teams', path: '/teams', alt: 'team list' },
	]

	const captainContent = [
		{ label: 'Manage Team', path: '/manage', alt: 'team management' },
	]

	const rosteredContent = [
		{ label: 'Your Team', path: '/manage', alt: 'team profile' },
	]

	const unrosteredContent = [
		{ label: 'Join a Team', path: '/manage', alt: 'team management' },
		{ label: 'Create a Team', path: '/create', alt: 'team creation' },
	]

	const userContent = [
		{ label: 'Edit Profile', path: '/profile', alt: 'user profile' },
		...(authStateUser
			? isAuthenticatedUserCaptain
				? captainContent
				: isAuthenticatedUserRostered
					? rosteredContent
					: unrosteredContent
			: []),
	]

	const handleCloseMobileNav = useCallback(() => {
		if (isMobileNavOpen) {
			setIsMobileNavOpen(false)
		}
	}, [isMobileNavOpen])

	const handleSignOut = useCallback(async () => {
		try {
			const success = await signOut()
			if (success) {
				logger.userAction('sign_out_success', 'TopNavigation', {
					userId: authStateUser?.uid,
				})
				toast.success('Logged Out', {
					description: 'You are no longer signed in to an account.',
				})
				handleCloseMobileNav()
			} else {
				toast.error('Unable to Log Out', {
					description: 'Please try again later.',
				})
			}
		} catch {
			toast.error('Unable to Log Out', {
				description: 'An unexpected error occurred.',
			})
		}
	}, [signOut, handleCloseMobileNav, authStateUser])

	const handleMobileLogin = useCallback((onLoginClick: () => void) => {
		onLoginClick()
		setIsMobileNavOpen(false)
	}, [])

	return {
		// State
		authStateUser,
		authStateLoading,
		signOutLoading,
		isMobileNavOpen,
		hasPendingOffers,
		hasRequiredTasks,

		// Content
		navContent,
		userContent,

		// Actions
		setIsMobileNavOpen,
		handleCloseMobileNav,
		handleSignOut,
		handleMobileLogin,
	}
}
