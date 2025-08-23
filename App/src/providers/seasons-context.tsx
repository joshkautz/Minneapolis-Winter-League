import React, {
	createContext,
	Dispatch,
	ReactNode,
	SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import {
	DocumentData,
	QuerySnapshot,
	seasonsQuery,
	FirestoreError,
	QueryDocumentSnapshot,
} from '@/firebase/firestore'
import { SeasonData } from '@/shared/utils'

interface SeasonsContextValue {
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
	currentSeasonQueryDocumentSnapshotLoading: boolean
	seasonsQuerySnapshot: QuerySnapshot<SeasonData, DocumentData> | undefined
	seasonsQuerySnapshotLoading: boolean
	seasonsQuerySnapshotError: FirestoreError | undefined
	selectedSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
	setSelectedSeasonQueryDocumentSnapshot: Dispatch<
		SetStateAction<QueryDocumentSnapshot<SeasonData, DocumentData> | undefined>
	>
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
		setSelectedSeasonQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<SeasonData, DocumentData> | undefined>()

	const [
		currentSeasonQueryDocumentSnapshot,
		setCurrentSeasonQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<SeasonData, DocumentData> | undefined>()

	const getMostRecentSeason = useCallback(():
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined => {
		return seasonsQuerySnapshot?.docs
			.sort((a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds)
			?.find((season) => season)
	}, [seasonsQuerySnapshot])

	useEffect(() => {
		setSelectedSeasonQueryDocumentSnapshot(getMostRecentSeason())
	}, [setSelectedSeasonQueryDocumentSnapshot, getMostRecentSeason])

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
