import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { QueryDocumentSnapshot } from 'firebase/firestore'
import { useAuthContext, useTeamsContext, useSeasonsContext } from '@/providers'
import type { PlayerSeason, TeamDocument } from '@/types'

interface TeamManagementResult {
	success: boolean
	title: string
	description: string
	navigation: boolean
}

interface UseTeamManagementReturn {
	isLoading: boolean
	isAdmin: boolean
	isCaptain: boolean
	hasTeam: boolean
	team: QueryDocumentSnapshot<TeamDocument> | undefined
	currentSeasonData: PlayerSeason | undefined
	handleResult: (result: TeamManagementResult) => void
}

/**
 * Custom hook for team management logic
 * Centralizes team management state and business logic
 */
export const useTeamManagement = (): UseTeamManagementReturn => {
	const { authenticatedUserSnapshot, authenticatedUserSnapshotLoading } =
		useAuthContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useTeamsContext()
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
	} = useSeasonsContext()

	const isAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin ?? false,
		[authenticatedUserSnapshot]
	)

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

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	const hasTeam = useMemo(
		() => Boolean(currentSeasonData?.team),
		[currentSeasonData]
	)

	const isCaptain = useMemo(
		() => Boolean(currentSeasonData?.captain),
		[currentSeasonData]
	)

	const isLoading = useMemo(
		() =>
			authenticatedUserSnapshotLoading ||
			currentSeasonTeamsQuerySnapshotLoading ||
			currentSeasonQueryDocumentSnapshotLoading ||
			!authenticatedUserSnapshot ||
			!currentSeasonQueryDocumentSnapshot,
		[
			authenticatedUserSnapshotLoading,
			currentSeasonTeamsQuerySnapshotLoading,
			currentSeasonQueryDocumentSnapshotLoading,
			authenticatedUserSnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const handleResult = useCallback(
		({ success, title, description }: TeamManagementResult) => {
			if (success) {
				toast.success(title, { description })
			} else {
				toast.error(title, { description })
			}
			// No navigation needed for team management operations
		},
		[]
	)

	return {
		// State
		isLoading,
		isAdmin,
		isCaptain,
		hasTeam,
		team,
		currentSeasonData,

		// Actions
		handleResult,
	}
}
