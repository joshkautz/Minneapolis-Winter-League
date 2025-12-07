// React
import { PropsWithChildren, createContext, useContext } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import {
	currentSeasonGamesQuery,
	currentSeasonRegularGamesQuery,
	currentSeasonPlayoffGamesQuery,
	FirestoreError,
	QuerySnapshot,
} from '@/firebase/firestore'
import { GameDocument } from '@/shared/utils'
import { useSeasonsContext } from './seasons-context'

interface GameProps {
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	gamesQuerySnapshotLoading: boolean
	gamesQuerySnapshotError: FirestoreError | undefined
	regularSeasonGamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	regularSeasonGamesQuerySnapshotLoading: boolean
	regularSeasonGamesQuerySnapshotError: FirestoreError | undefined
	playoffGamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	playoffGamesQuerySnapshotLoading: boolean
	playoffGamesQuerySnapshotError: FirestoreError | undefined
}

// eslint-disable-next-line react-refresh/only-export-components
export const GamesContext = createContext<GameProps>({
	gamesQuerySnapshot: undefined,
	gamesQuerySnapshotLoading: false,
	gamesQuerySnapshotError: undefined,
	regularSeasonGamesQuerySnapshot: undefined,
	regularSeasonGamesQuerySnapshotLoading: false,
	regularSeasonGamesQuerySnapshotError: undefined,
	playoffGamesQuerySnapshot: undefined,
	playoffGamesQuerySnapshotLoading: false,
	playoffGamesQuerySnapshotError: undefined,
})

// eslint-disable-next-line react-refresh/only-export-components
export const useGamesContext = () => useContext(GamesContext)

export const GamesContextProvider = ({ children }: PropsWithChildren) => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [
		gamesQuerySnapshot,
		gamesQuerySnapshotLoading,
		gamesQuerySnapshotError,
	] = useCollection(
		currentSeasonGamesQuery(selectedSeasonQueryDocumentSnapshot)
	)

	const [
		regularSeasonGamesQuerySnapshot,
		regularSeasonGamesQuerySnapshotLoading,
		regularSeasonGamesQuerySnapshotError,
	] = useCollection(
		currentSeasonRegularGamesQuery(selectedSeasonQueryDocumentSnapshot)
	)

	const [
		playoffGamesQuerySnapshot,
		playoffGamesQuerySnapshotLoading,
		playoffGamesQuerySnapshotError,
	] = useCollection(
		currentSeasonPlayoffGamesQuery(selectedSeasonQueryDocumentSnapshot)
	)

	return (
		<GamesContext.Provider
			value={{
				gamesQuerySnapshot,
				gamesQuerySnapshotLoading,
				gamesQuerySnapshotError,
				regularSeasonGamesQuerySnapshot,
				regularSeasonGamesQuerySnapshotLoading,
				regularSeasonGamesQuerySnapshotError,
				playoffGamesQuerySnapshot,
				playoffGamesQuerySnapshotLoading,
				playoffGamesQuerySnapshotError,
			}}
		>
			{children}
		</GamesContext.Provider>
	)
}
