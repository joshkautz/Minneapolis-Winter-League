import { useMemo } from 'react'
import { useAuthContext, useSeasonsContext } from '@/providers'
import type { PlayerSeason } from '@/types'

/**
 * Comprehensive user status hook that combines authentication state,
 * loading states, and user permissions in one place
 */
export const useUserStatus = () => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		userRefreshCount,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	// Loading states - we're loading if:
	// 1. Auth state is still loading (no user yet)
	// 2. OR we have a user but no snapshot yet (snapshot still loading)
	const isLoading = useMemo(() => {
		// Still determining auth state
		if (authStateLoading && !authStateUser) {
			return true
		}
		// Have user but snapshot not yet loaded
		if (authStateUser && !authenticatedUserSnapshot) {
			return true
		}
		return false
	}, [authStateUser, authStateLoading, authenticatedUserSnapshot])

	// Get current season data for the user
	const currentSeasonData = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	// User permissions and status
	const isAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin ?? false,
		[authenticatedUserSnapshot]
	)

	const isRostered = useMemo(
		() => Boolean(currentSeasonData?.team),
		[currentSeasonData]
	)

	const isCaptain = useMemo(
		() => Boolean(currentSeasonData?.captain),
		[currentSeasonData]
	)

	const hasPaid = useMemo(
		() => Boolean(currentSeasonData?.paid),
		[currentSeasonData]
	)

	const hasSignedWaiver = useMemo(
		() => Boolean(currentSeasonData?.signed),
		[currentSeasonData]
	)

	const isBanned = useMemo(
		() => Boolean(currentSeasonData?.banned),
		[currentSeasonData]
	)

	// Email verification status
	// Note: userRefreshCount is included to re-evaluate when user data is refreshed
	const isEmailVerified = useMemo(
		() => Boolean(authStateUser?.emailVerified),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[authStateUser, userRefreshCount]
	)

	// Combined status checks
	const isAuthenticated = useMemo(
		() => Boolean(authStateUser && authenticatedUserSnapshot),
		[authStateUser, authenticatedUserSnapshot]
	)

	const hasRequiredTasks = useMemo(
		() => !hasPaid || !hasSignedWaiver,
		[hasPaid, hasSignedWaiver]
	)

	const canCreateTeam = useMemo(
		() => isAuthenticated && !isRostered && !isBanned,
		[isAuthenticated, isRostered, isBanned]
	)

	const canJoinTeam = useMemo(
		() => isAuthenticated && !isRostered && !isBanned,
		[isAuthenticated, isRostered, isBanned]
	)

	return {
		// Loading states
		isLoading,
		isAuthStateLoading: authStateLoading,
		isUserSnapshotLoading: authenticatedUserSnapshotLoading,

		// Raw data
		authStateUser,
		userSnapshot: authenticatedUserSnapshot,
		currentSeasonData,

		// Permissions
		isAdmin,
		isRostered,
		isCaptain,
		hasPaid,
		hasSignedWaiver,
		isBanned,
		isEmailVerified,

		// Combined status
		isAuthenticated,
		hasRequiredTasks,
		canCreateTeam,
		canJoinTeam,
	}
}
