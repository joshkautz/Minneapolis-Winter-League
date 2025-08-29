import { useMemo } from 'react'
import { useAuthContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import type { PlayerSeason } from '@minneapolis-winter-league/shared'

/**
 * Custom hook for checking user authentication permissions
 * Centralizes common permission checks used across components
 */
export const useAuthPermissions = () => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin,
		[authenticatedUserSnapshot]
	)

	const isRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.team !== null,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasSignedWaiver = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	return {
		isAdmin,
		isRostered,
		isCaptain,
		hasPaid,
		hasSignedWaiver,
		userSnapshot: authenticatedUserSnapshot,
	}
}
