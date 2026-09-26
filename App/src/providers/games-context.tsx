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
} from '@/firebase/collections/games'
import { type FirestoreError, type QuerySnapshot } from 'firebase/firestore'
import { logger, errorMessage } from '@/shared/utils'
import { GameDocument } from '@/types'
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

const GamesContext = createContext<GameProps | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useGamesContext = (): GameProps => {
	const context = useContext(GamesContext)
	if (!context) {
		throw new Error(
			'useGamesContext must be used within a GamesContextProvider'
		)
	}
	return context
}

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

	// Log and notify on games query errors
	useEffect(() => {
		const errors = [
			{ error: gamesQuerySnapshotError, name: 'games' },
			{
				error: regularSeasonGamesQuerySnapshotError,
				name: 'regular season games',
			},
			{ error: playoffGamesQuerySnapshotError, name: 'playoff games' },
		].filter((e) => e.error)

		errors.forEach(({ error, name }) => {
			if (error) {
				logger.error(`Failed to load ${name}`, error, {
					component: 'GamesContextProvider',
				})
				toast.error(`Failed to load ${name}`, {
					description: errorMessage(
						error,
						'Please reload the page to try again.'
					),
				})
			}
		})
	}, [
		gamesQuerySnapshotError,
		regularSeasonGamesQuerySnapshotError,
		playoffGamesQuerySnapshotError,
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
			}}
		>
			{children}
		</GamesContext.Provider>
	)
}
