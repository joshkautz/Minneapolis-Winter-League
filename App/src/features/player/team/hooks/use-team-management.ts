import { useMemo } from 'react'
import { QueryDocumentSnapshot } from 'firebase/firestore'
import { useAuthContext, useTeamsContext, useSeasonsContext } from '@/providers'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import type { TeamSeasonDocument } from '@/types'

interface UseTeamManagementReturn {
	isLoading: boolean
	isCaptain: boolean
	hasTeam: boolean
	team: QueryDocumentSnapshot<TeamSeasonDocument> | undefined
}

/**
 * The signed-in player's team this season, and whether they captain it, for
 * the captain's edit-team form.
 */
export const useTeamManagement = (): UseTeamManagementReturn => {
	const {
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authenticatedUserSeasonsSnapshot,
	} = useAuthContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useTeamsContext()
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
	} = useSeasonsContext()

	const currentSeasonData = useMemo(
		() =>
			authenticatedUserSeasonsSnapshot?.docs
				.find(
					(docSnap) => docSnap.id === currentSeasonQueryDocumentSnapshot?.id
				)
				?.data(),
		[authenticatedUserSeasonsSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(teamDoc) =>
					canonicalTeamIdFromTeamSeasonDoc(teamDoc) ===
					currentSeasonData?.team?.id
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

	return { isLoading, isCaptain, hasTeam, team }
}
