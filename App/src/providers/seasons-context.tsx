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
} from '@/firebase'
import { SeasonDocument, initialSelectedSeasonId, logger } from '@/shared/utils'

/** The season the visitor last picked in a season selector. */
const PICKED_SEASON_KEY = 'season'
/** The newest season at the time of that pick; see initialSelectedSeasonId. */
const PICKED_WHILE_NEWEST_KEY = 'seasonPickedWhileNewest'

/** Storage can be unavailable (private browsing, blocked site data). */
const readStorage = (key: string): string | null => {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

const writeStorage = (key: string, value: string | null): void => {
	try {
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {
		// Only the preference is lost; the selection still applies this visit.
	}
}

interface SeasonsContextValue {
	currentSeasonQueryDocumentSnapshot:
		QueryDocumentSnapshot<SeasonDocument> | undefined
	currentSeasonQueryDocumentSnapshotLoading: boolean
	seasonsQuerySnapshot: QuerySnapshot<SeasonDocument> | undefined
	seasonsQuerySnapshotLoading: boolean
	seasonsQuerySnapshotError: FirestoreError | undefined
	selectedSeasonQueryDocumentSnapshot:
		QueryDocumentSnapshot<SeasonDocument> | undefined
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

	const [
		currentSeasonQueryDocumentSnapshot,
		setCurrentSeasonQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<SeasonDocument> | undefined>()

	const getMostRecentSeason = useCallback(():
		QueryDocumentSnapshot<SeasonDocument> | undefined => {
		return seasonsQuerySnapshot?.docs
			.sort((a, b) => b.data().dateStart.seconds - a.data().dateStart.seconds)
			?.find((season) => season)
	}, [seasonsQuerySnapshot])

	// A season the visitor picks: remembered, along with which season was
	// newest at the time, so the pick lapses once a newer season exists.
	const setSelectedSeasonQueryDocumentSnapshot = useCallback(
		(value: QueryDocumentSnapshot<SeasonDocument> | undefined) => {
			writeStorage(PICKED_SEASON_KEY, value?.id ?? null)
			writeStorage(
				PICKED_WHILE_NEWEST_KEY,
				value ? (getMostRecentSeason()?.id ?? null) : null
			)
			setSelectedSeasonQueryDocumentSnapshotState(value)
		},
		[getMostRecentSeason]
	)

	// Initialize the selection. Deliberately does not go through the setter
	// above: a default is not a pick, and remembering it pinned every visitor
	// to whichever season was newest on their first visit.
	const [hasInitialized, setHasInitialized] = useState(false)
	useEffect(() => {
		if (!seasonsQuerySnapshot || hasInitialized) return

		const selectedId = initialSelectedSeasonId({
			pickedId: readStorage(PICKED_SEASON_KEY),
			pickedWhileNewestId: readStorage(PICKED_WHILE_NEWEST_KEY),
			newestId: getMostRecentSeason()?.id,
			seasonIds: seasonsQuerySnapshot.docs.map((doc) => doc.id),
		})

		const timer = setTimeout(() => {
			setSelectedSeasonQueryDocumentSnapshotState(
				seasonsQuerySnapshot.docs.find((doc) => doc.id === selectedId)
			)
			setHasInitialized(true)
		}, 0)
		return () => clearTimeout(timer)
	}, [seasonsQuerySnapshot, getMostRecentSeason, hasInitialized])

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
