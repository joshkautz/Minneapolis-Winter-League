import { useCollection } from 'react-firebase-hooks/firestore'
import {
	DocumentData,
	QuerySnapshot,
	seasonsQuery,
	FirestoreError,
	QueryDocumentSnapshot,
} from '@/firebase/firestore'
import {
	createContext,
	Dispatch,
	FC,
	ReactNode,
	SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'
import { SeasonData } from '@/shared/utils'

interface SeasonProps {
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

export const SeasonsContext = createContext<SeasonProps>({
	currentSeasonQueryDocumentSnapshot: undefined,
	currentSeasonQueryDocumentSnapshotLoading: false,
	seasonsQuerySnapshot: undefined,
	seasonsQuerySnapshotLoading: false,
	seasonsQuerySnapshotError: undefined,
	selectedSeasonQueryDocumentSnapshot: undefined,
	setSelectedSeasonQueryDocumentSnapshot: () => {},
})

export const useSeasonsContext = () => useContext(SeasonsContext)

export const SeasonsContextProvider: FC<{ children: ReactNode }> = ({
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

	const getMostRecentSeason = useCallback(() => {
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

	return (
		<SeasonsContext.Provider
			value={{
				currentSeasonQueryDocumentSnapshot,
				currentSeasonQueryDocumentSnapshotLoading: seasonsQuerySnapshotLoading,
				seasonsQuerySnapshot,
				seasonsQuerySnapshotLoading,
				seasonsQuerySnapshotError,
				selectedSeasonQueryDocumentSnapshot,
				setSelectedSeasonQueryDocumentSnapshot,
			}}
		>
			{children}
		</SeasonsContext.Provider>
	)
}
