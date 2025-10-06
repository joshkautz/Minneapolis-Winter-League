// React
import { PropsWithChildren, createContext, useContext, useMemo } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import {
	currentSeasonTeamsQuery,
	FirestoreError,
	QuerySnapshot,
	teamsQuery,
} from '@/firebase/firestore'
import { TeamDocument } from '@/shared/utils'
import { useSeasonsContext } from './seasons-context'
import { useAuthContext } from './auth-context'

interface TeamProps {
	currentSeasonTeamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
	currentSeasonTeamsQuerySnapshotLoading: boolean
	currentSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	selectedSeasonTeamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
	selectedSeasonTeamsQuerySnapshotLoading: boolean
	selectedSeasonTeamsQuerySnapshotError: FirestoreError | undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot:
		| QuerySnapshot<TeamDocument>
		| undefined
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotLoading: boolean
	teamsForWhichAuthenticatedUserIsCaptainQuerySnapshotError:
		| FirestoreError
		| undefined
}

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
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
