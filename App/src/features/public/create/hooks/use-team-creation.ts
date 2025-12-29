import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { StorageReference } from '@/firebase/storage'
import { useAuthContext, useSeasonsContext, useTeamsContext } from '@/providers'
import type { PlayerSeason } from '@/types'

export interface TeamCreationData {
	name: string | undefined
	storageRef: StorageReference | undefined
	teamId: string | undefined
}

interface TeamCreationResult {
	success: boolean
	title: string
	description: string
	navigation: boolean
}

interface UseTeamCreationReturn {
	rolloverMode: boolean
	isLoading: boolean
	isRostered: boolean
	isTeamRegistrationFull: boolean
	currentSeasonQueryDocumentSnapshot: ReturnType<
		typeof useSeasonsContext
	>['currentSeasonQueryDocumentSnapshot']
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
	handleResult: (result: TeamCreationResult) => void
	toggleRolloverMode: () => void
}

/**
 * Custom hook for team creation logic
 * Centralizes team creation state and business logic
 */
export const useTeamCreation = (): UseTeamCreationReturn => {
	const navigate = useNavigate()
	const { authenticatedUserSnapshot, authenticatedUserSnapshotLoading } =
		useAuthContext()
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
	} = useSeasonsContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()

	const [newTeamDocument, setNewTeamDocument] = useState<TeamCreationData>() // Keep for backward compatibility
	// This is used by child components to store team creation data
	void newTeamDocument // Suppress unused variable warning
	const [rolloverMode, setRolloverMode] = useState(false)

	const isRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				) || false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isTeamRegistrationFull = useMemo(() => {
		if (!currentSeasonTeamsQuerySnapshot) return false

		// Count teams that are fully registered
		const registeredTeamsCount = currentSeasonTeamsQuerySnapshot.docs.filter(
			(teamDoc) => teamDoc.data().registered === true
		).length

		return registeredTeamsCount >= 12
	}, [currentSeasonTeamsQuerySnapshot])

	const isLoading = useMemo(
		() =>
			!authenticatedUserSnapshot ||
			authenticatedUserSnapshotLoading ||
			!currentSeasonQueryDocumentSnapshot ||
			currentSeasonQueryDocumentSnapshotLoading ||
			!seasonsQuerySnapshot ||
			seasonsQuerySnapshotLoading,
		[
			authenticatedUserSnapshot,
			authenticatedUserSnapshotLoading,
			currentSeasonQueryDocumentSnapshot,
			currentSeasonQueryDocumentSnapshotLoading,
			seasonsQuerySnapshot,
			seasonsQuerySnapshotLoading,
		]
	)

	const handleResult = useCallback(
		({ success, title, description, navigation }: TeamCreationResult) => {
			if (success) {
				toast.success(title, { description })
			} else {
				toast.error(title, { description })
			}
			if (navigation) {
				navigate('/manage')
			}
		},
		[navigate]
	)

	const toggleRolloverMode = useCallback(() => {
		setRolloverMode((prev) => !prev)
	}, [])

	// Team creation is now handled directly in the forms via Firebase Functions
	// No additional processing needed here since functions handle the complete workflow

	return {
		// State
		rolloverMode,
		isLoading,
		isRostered,
		isTeamRegistrationFull,
		currentSeasonQueryDocumentSnapshot,

		// Actions
		setNewTeamDocument,
		handleResult,
		toggleRolloverMode,
	}
}
