import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Timestamp } from '@firebase/firestore'
import { useAuthContext, useSeasonsContext } from '@/providers'
import type { PlayerSeason } from '@minneapolis-winter-league/shared'

interface TeamCreationData {
	name: string | undefined
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
	isSubmitting: boolean
	isLoading: boolean
	isAdmin: boolean
	isRostered: boolean
	isRegistrationOpen: boolean
	currentSeasonQueryDocumentSnapshot: ReturnType<
		typeof useSeasonsContext
	>['currentSeasonQueryDocumentSnapshot']
	setNewTeamData: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
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

	const [newTeamData, setNewTeamData] = useState<TeamCreationData>()
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
	const [rolloverMode, setRolloverMode] = useState(false)

	const isAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin ?? false,
		[authenticatedUserSnapshot]
	)

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

	const isRegistrationOpen =
		useMemo(
			() =>
				currentSeasonQueryDocumentSnapshot &&
				Timestamp.now() >
					currentSeasonQueryDocumentSnapshot?.data().registrationStart &&
				Timestamp.now() <
					currentSeasonQueryDocumentSnapshot?.data().registrationEnd,
			[currentSeasonQueryDocumentSnapshot]
		) || false

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

	// TODO: Implement team creation logic when firebase functions are available
	// Effect for handling team creation
	if (newTeamData) {
		// Team creation logic will be implemented here
	}

	return {
		// State
		rolloverMode,
		isSubmitting,
		isLoading,
		isAdmin,
		isRostered,
		isRegistrationOpen,
		currentSeasonQueryDocumentSnapshot,

		// Actions
		setNewTeamData,
		setIsSubmitting,
		handleResult,
		toggleRolloverMode,
	}
}
