import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthContext, useSeasonsContext } from '@/providers'
import { useIsTeamRegistrationFull } from '@/shared/hooks'
import type { FormResult } from '@/shared/types'

/** A create or rollover result; `navigation` sends the captain to /manage. */
export interface TeamCreationResult extends FormResult {
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
	handleResult: (result: TeamCreationResult) => void
	toggleRolloverMode: () => void
}

/**
 * Custom hook for team creation logic
 * Centralizes team creation state and business logic
 */
export const useTeamCreation = (): UseTeamCreationReturn => {
	const navigate = useNavigate()
	const {
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authenticatedUserSeasonsSnapshot,
	} = useAuthContext()
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
	} = useSeasonsContext()
	const isTeamRegistrationFull = useIsTeamRegistrationFull()
	const [rolloverMode, setRolloverMode] = useState(false)

	const isRostered = useMemo(
		() =>
			authenticatedUserSeasonsSnapshot?.docs.some(
				(docSnap) =>
					docSnap.id === currentSeasonQueryDocumentSnapshot?.id &&
					docSnap.data().team
			) || false,
		[authenticatedUserSeasonsSnapshot, currentSeasonQueryDocumentSnapshot]
	)

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

	return {
		// State
		rolloverMode,
		isLoading,
		isRostered,
		isTeamRegistrationFull,
		currentSeasonQueryDocumentSnapshot,

		// Actions
		handleResult,
		toggleRolloverMode,
	}
}
