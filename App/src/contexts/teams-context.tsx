// React
import { PropsWithChildren, createContext, useContext, useMemo } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import {
	currentSeasonTeamsQuery,
	DocumentData,
	FirestoreError,
	QuerySnapshot,
	teamsQuery,
} from '@/firebase/firestore'
import { TeamData } from '@/lib/interfaces'
import { useSeasonsContext } from './seasons-context'
import { useAuthContext } from './auth-context'

interface TeamProps {
	currentSeasonTeamsQuerySnapshot:
		| QuerySnapshot<TeamData, DocumentData>
		| undefined
	currentSeasonTeamsQuerySnapshotLoading: boolean
	currentSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	selectedSeasonTeamsQuerySnapshot:
		| QuerySnapshot<TeamData, DocumentData>
		| undefined
	selectedSeasonTeamsQuerySnapshotLoading: boolean
	selectedSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot:
		| QuerySnapshot<TeamData, DocumentData>
		| undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: boolean
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError:
		| FirestoreError
		| undefined
}

export const TeamsContext = createContext<TeamProps>({
	currentSeasonTeamsQuerySnapshot: undefined,
	currentSeasonTeamsQuerySnapshotLoading: false,
	currentSeasonTeamsQuerySnapshotError: undefined,
	selectedSeasonTeamsQuerySnapshot: undefined,
	selectedSeasonTeamsQuerySnapshotLoading: false,
	selectedSeasonTeamsQuerySnapshotError: undefined,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot: undefined,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: false,
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError: undefined,
})

export const useTeamsContext = () => useContext(TeamsContext)

export const TeamsContextProvider: React.FC<PropsWithChildren> = ({
	children,
}) => {
	const {
		selectedSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshot,
	} = useSeasonsContext()
	const { authenticatedUserSnapshot } = useAuthContext()

	const teamsForWhichAuthenticatedUserIsCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.filter((season) => season.captain)
				.map((season) => season.team),
		[authenticatedUserSnapshot]
	)

	const [
		selectedSeasonTeamsQuerySnapshot,
		selectedSeasonTeamsQuerySnapshotLoading,
		selectedSeasonTeamsQuerySnapshotError,
	] = useCollection(
		currentSeasonTeamsQuery(selectedSeasonQueryDocumentSnapshot)
	)

	const [
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
		currentSeasonTeamsQuerySnapshotError,
	] = useCollection(currentSeasonTeamsQuery(currentSeasonQueryDocumentSnapshot))

	const [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
	] = useCollection(teamsQuery(teamsForWhichAuthenticatedUserIsCaptain))

	return (
		<TeamsContext.Provider
			value={{
				currentSeasonTeamsQuerySnapshot,
				currentSeasonTeamsQuerySnapshotLoading,
				currentSeasonTeamsQuerySnapshotError,
				selectedSeasonTeamsQuerySnapshot,
				selectedSeasonTeamsQuerySnapshotLoading,
				selectedSeasonTeamsQuerySnapshotError,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading,
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError,
			}}
		>
			{children}
		</TeamsContext.Provider>
	)
}
