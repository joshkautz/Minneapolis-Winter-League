import React, {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import {
	QuerySnapshot,
	seasonsQuery,
	FirestoreError,
	QueryDocumentSnapshot,
} from '@/firebase/firestore'
import { SeasonDocument } from '@/shared/utils'

interface SeasonsContextValue {
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
	currentSeasonQueryDocumentSnapshotLoading: boolean
	seasonsQuerySnapshot: QuerySnapshot<SeasonDocument> | undefined
	seasonsQuerySnapshotLoading: boolean
	seasonsQuerySnapshotError: FirestoreError | undefined
	selectedSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
	setSelectedSeasonQueryDocumentSnapshot: (
		value: QueryDocumentSnapshot<SeasonDocument> | undefined
	) => void
}

interface SeasonsContextProviderProps {
	children: ReactNode
}

const SeasonsContext = createContext<SeasonsContextValue | null>(null)

export const useSeasonsContext = (): SeasonsContextValue => {
	const context = useContext(SeasonsContext)
	if (!context) {
		throw new Error(
			'useSeasonsContext must be used within a SeasonsContextProvider'
		)
	}
	return context
}

export const SeasonsContextProvider: React.FC<SeasonsContextProviderProps> = ({
	children,
}) => {
	const [
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
		seasonsQuerySnapshotError,
	] = useCollection(seasonsQuery())

	const [
		selectedSeasonQueryDocumentSnapshot,
		setSelectedSeasonQueryDocumentSnapshotState,
	] = useState<QueryDocumentSnapshot<SeasonDocument> | undefined>()

	// Wrapper to persist selected season to localStorage
	const setSelectedSeasonQueryDocumentSnapshot = useCallback(
		(value: QueryDocumentSnapshot<SeasonDocument> | undefined) => {
			if (value) {
				localStorage.setItem('season', value.id)
			} else {
				localStorage.removeItem('season')
			}
			setSelectedSeasonQueryDocumentSnapshotState(value)
		},
		[]
	)

	const [
		currentSeasonQueryDocumentSnapshot,
		setCurrentSeasonQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<SeasonDocument> | undefined>()

	const getMostRecentSeason = useCallback(():
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined => {
		return seasonsQuerySnapshot?.docs
			.sort((a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds)
			?.find((season) => season)
	}, [seasonsQuerySnapshot])

	// Initialize selected season from localStorage or fall back to most recent
	useEffect(() => {
		if (!seasonsQuerySnapshot) return

		const storedSeasonId = localStorage.getItem('season')

		if (storedSeasonId) {
			// Try to find the stored season in the current seasons
			const storedSeason = seasonsQuerySnapshot.docs.find(
				(doc) => doc.id === storedSeasonId
			)
			if (storedSeason) {
				setSelectedSeasonQueryDocumentSnapshot(storedSeason)
				return
			}
		}

		// If no stored season or it doesn't exist, use the most recent season
		setSelectedSeasonQueryDocumentSnapshot(getMostRecentSeason())
	}, [seasonsQuerySnapshot, getMostRecentSeason])

	useEffect(() => {
		setCurrentSeasonQueryDocumentSnapshot(getMostRecentSeason())
	}, [setCurrentSeasonQueryDocumentSnapshot, getMostRecentSeason])

	const contextValue: SeasonsContextValue = {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading: seasonsQuerySnapshotLoading,
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
		seasonsQuerySnapshotError,
		selectedSeasonQueryDocumentSnapshot,
		setSelectedSeasonQueryDocumentSnapshot,
	}

	return (
		<SeasonsContext.Provider value={contextValue}>
			{children}
		</SeasonsContext.Provider>
	)
}
