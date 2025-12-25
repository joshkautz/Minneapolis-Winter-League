// React
import { PropsWithChildren, createContext, useContext, useEffect } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'

// Winter League
import {
	currentSeasonGamesQuery,
	currentSeasonRegularGamesQuery,
	currentSeasonPlayoffGamesQuery,
	allGamesQuery,
	FirestoreError,
	QuerySnapshot,
} from '@/firebase'
import { GameDocument, logger } from '@/shared/utils'
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
	allGamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	allGamesQuerySnapshotLoading: boolean
	allGamesQuerySnapshotError: FirestoreError | undefined
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
	allGamesQuerySnapshot: undefined,
	allGamesQuerySnapshotLoading: false,
	allGamesQuerySnapshotError: undefined,
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

	const [
		allGamesQuerySnapshot,
		allGamesQuerySnapshotLoading,
		allGamesQuerySnapshotError,
	] = useCollection(allGamesQuery())

	// Log and notify on games query errors
	useEffect(() => {
		const errors = [
			{ error: gamesQuerySnapshotError, name: 'games' },
			{
				error: regularSeasonGamesQuerySnapshotError,
				name: 'regular season games',
			},
			{ error: playoffGamesQuerySnapshotError, name: 'playoff games' },
			{ error: allGamesQuerySnapshotError, name: 'all games' },
		].filter((e) => e.error)

		errors.forEach(({ error, name }) => {
			if (error) {
				logger.error(`Failed to load ${name}:`, {
					component: 'GamesContextProvider',
					error: error.message,
				})
				toast.error(`Failed to load ${name}`, {
					description: error.message,
				})
			}
		})
	}, [
		gamesQuerySnapshotError,
		regularSeasonGamesQuerySnapshotError,
		playoffGamesQuerySnapshotError,
		allGamesQuerySnapshotError,
	])

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
				allGamesQuerySnapshot,
				allGamesQuerySnapshotLoading,
				allGamesQuerySnapshotError,
			}}
		>
			{children}
		</GamesContext.Provider>
	)
}
