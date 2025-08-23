import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Timestamp } from '@firebase/firestore'
import { useUploadFile } from 'react-firebase-hooks/storage'
import { useAuthContext, useSeasonsContext } from '@/providers'
import { useLegacyFileUpload } from '@/shared/hooks'
import { StorageReference } from '@/firebase/storage'

interface TeamCreationData {
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
	uploadFile: ReturnType<typeof useUploadFile>[0]
	storageRef: StorageReference | undefined
	setStorageRef: (ref: StorageReference | undefined) => void
	downloadUrl: string | undefined
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

	const { storageRef, setStorageRef, downloadUrl } = useLegacyFileUpload()
	const [uploadFile] = useUploadFile()

	const isAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin || false,
		[authenticatedUserSnapshot]
	)

	const isRostered = useMemo(
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

	// Effect for handling team creation without logo
	useEffect(() => {
		if (newTeamData && !newTeamData.storageRef) {
			// TODO: Implement team creation logic when firebase functions are uncommented
			console.log('Creating team without logo:', newTeamData)
		}
	}, [newTeamData])

	// Effect for handling team creation with logo
	useEffect(() => {
		if (newTeamData && storageRef && downloadUrl) {
			// TODO: Implement team creation logic when firebase functions are uncommented
			console.log('Creating team with logo:', newTeamData, downloadUrl)
		}
	}, [newTeamData, storageRef, downloadUrl])

	// Update storage ref when new team data includes it
	useEffect(() => {
		if (newTeamData?.storageRef) {
			setStorageRef(newTeamData.storageRef)
		}
	}, [newTeamData, setStorageRef])

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
		uploadFile,
		storageRef,
		setStorageRef,
		downloadUrl,
	}
}
