import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import {
	QuerySnapshot,
	seasonsQuery,
	FirestoreError,
	QueryDocumentSnapshot,
} from '@/firebase/firestore'
import { SeasonDocument, logger } from '@/shared/utils'

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

// eslint-disable-next-line react-refresh/only-export-components
export const useSeasonsContext = (): SeasonsContextValue => {
	const context = useContext(SeasonsContext)
	if (!context) {
		throw new Error(
			'useSeasonsContext must be used within a SeasonsContextProvider'
		)
	}
	return context
}

export const SeasonsContextProvider = ({
	children,
}: SeasonsContextProviderProps) => {
	const [
		seasonsQuerySnapshot,
		seasonsQuerySnapshotLoading,
		seasonsQuerySnapshotError,
	] = useCollection(seasonsQuery())

	// Log and notify on seasons query errors
	useEffect(() => {
		if (seasonsQuerySnapshotError) {
			logger.error('Failed to load seasons:', {
				component: 'SeasonsContextProvider',
				error: seasonsQuerySnapshotError.message,
			})
			toast.error('Failed to load seasons', {
				description: seasonsQuerySnapshotError.message,
			})
		}
	}, [seasonsQuerySnapshotError])

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
	const [hasInitialized, setHasInitialized] = useState(false)
	useEffect(() => {
		if (!seasonsQuerySnapshot || hasInitialized) return

		const storedSeasonId = localStorage.getItem('season')

		if (storedSeasonId) {
			// Try to find the stored season in the current seasons
			const storedSeason = seasonsQuerySnapshot.docs.find(
				(doc) => doc.id === storedSeasonId
			)
			if (storedSeason) {
				const timer = setTimeout(() => {
					setSelectedSeasonQueryDocumentSnapshot(storedSeason)
					setHasInitialized(true)
				}, 0)
				return () => clearTimeout(timer)
			}
		}

		// If no stored season or it doesn't exist, use the most recent season
		const timer = setTimeout(() => {
			setSelectedSeasonQueryDocumentSnapshot(getMostRecentSeason())
			setHasInitialized(true)
		}, 0)
		return () => clearTimeout(timer)
	}, [
		seasonsQuerySnapshot,
		getMostRecentSeason,
		hasInitialized,
		setSelectedSeasonQueryDocumentSnapshot,
	])

	useEffect(() => {
		const timer = setTimeout(() => {
			setCurrentSeasonQueryDocumentSnapshot(getMostRecentSeason())
		}, 0)
		return () => clearTimeout(timer)
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
