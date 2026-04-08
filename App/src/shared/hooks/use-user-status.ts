import { useMemo } from 'react'
import { useAuthContext, useSeasonsContext } from '@/providers'

/**
 * Comprehensive user status hook that combines authentication state,
 * loading states, and user permissions in one place.
 *
 * After the 2026 data model migration, per-season player data lives in
 * the `players/{uid}/seasons/{seasonId}` subcollection, exposed by
 * AuthContext as `authenticatedUserSeasonsSnapshot`. This hook reads
 * from that snapshot.
 */
export const useUserStatus = () => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authenticatedUserSeasonsSnapshot,
		authenticatedUserSeasonsSnapshotLoading,
		userRefreshCount,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	// Loading states - we're loading if:
	// 1. Auth state is still loading (no user yet)
	// 2. OR we have a user but no parent snapshot yet
	// 3. OR we have a user but no per-season snapshot yet
	const isLoading = useMemo(() => {
		if (authStateLoading && !authStateUser) return true
		if (authStateUser && !authenticatedUserSnapshot) return true
		if (authStateUser && !authenticatedUserSeasonsSnapshot) return true
		return false
	}, [
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		authenticatedUserSeasonsSnapshot,
	])

	// Look up the current-season subdoc for this player.
	const currentSeasonData = useMemo(() => {
		const sid = currentSeasonQueryDocumentSnapshot?.id
		if (!sid || !authenticatedUserSeasonsSnapshot) return undefined
		return authenticatedUserSeasonsSnapshot.docs
			.find((d) => d.id === sid)
			?.data()
	}, [authenticatedUserSeasonsSnapshot, currentSeasonQueryDocumentSnapshot])

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

	const isEmailVerified = useMemo(
		() => Boolean(authStateUser?.emailVerified),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[authStateUser, userRefreshCount]
	)

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
		isUserSnapshotLoading:
			authenticatedUserSnapshotLoading ||
			authenticatedUserSeasonsSnapshotLoading,

		// Raw data
		authStateUser,
		userSnapshot: authenticatedUserSnapshot,
		userSeasonsSnapshot: authenticatedUserSeasonsSnapshot,
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
