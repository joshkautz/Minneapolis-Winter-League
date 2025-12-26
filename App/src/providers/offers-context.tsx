// React
import {
	PropsWithChildren,
	createContext,
	useContext,
	useEffect,
	useMemo,
} from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'

// Winter League
import {
	outgoingOffersQuery,
	incomingOffersQuery,
	FirestoreError,
	QuerySnapshot,
} from '@/firebase'
import { useAuthContext } from './auth-context'
import { OfferDocument, logger } from '@/shared/utils'
import { useSeasonsContext } from './seasons-context'

interface OffersProps {
	outgoingOffersQuerySnapshot: QuerySnapshot<OfferDocument> | undefined
	outgoingOffersQuerySnapshotLoading: boolean
	outgoingOffersQuerySnapshotError: FirestoreError | undefined
	incomingOffersQuerySnapshot: QuerySnapshot<OfferDocument> | undefined
	incomingOffersQuerySnapshotLoading: boolean
	incomingOffersQuerySnapshotError: FirestoreError | undefined
	/** True when auth or season data is still loading (dependencies not ready) */
	dependenciesLoading: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const OffersContext = createContext<OffersProps>({
	outgoingOffersQuerySnapshot: undefined,
	outgoingOffersQuerySnapshotLoading: false,
	outgoingOffersQuerySnapshotError: undefined,
	incomingOffersQuerySnapshot: undefined,
	incomingOffersQuerySnapshotLoading: false,
	incomingOffersQuerySnapshotError: undefined,
	dependenciesLoading: true,
})

// eslint-disable-next-line react-refresh/only-export-components
export const useOffersContext = () => useContext(OffersContext)

export const OffersContextProvider = ({ children }: PropsWithChildren) => {
	const {
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authStateUser,
		authStateLoading,
	} = useAuthContext()
	const {
		currentSeasonQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshotLoading,
	} = useSeasonsContext()

	// Track whether the dependencies needed to build the query are still loading
	// This is different from the actual Firestore query loading
	const dependenciesLoading = useMemo(() => {
		// If auth state is still loading, we're loading
		if (authStateLoading) return true
		// If user is logged in but their player doc is still loading, we're loading
		if (authStateUser && authenticatedUserSnapshotLoading) return true
		// If season data is still loading, we're loading
		if (currentSeasonQueryDocumentSnapshotLoading) return true
		return false
	}, [
		authStateLoading,
		authStateUser,
		authenticatedUserSnapshotLoading,
		currentSeasonQueryDocumentSnapshotLoading,
	])

	// Build queries - will be undefined if dependencies aren't ready
	const outgoingQuery = useMemo(
		() =>
			outgoingOffersQuery(
				authenticatedUserSnapshot,
				currentSeasonQueryDocumentSnapshot
			),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const incomingQuery = useMemo(
		() =>
			incomingOffersQuery(
				authenticatedUserSnapshot,
				currentSeasonQueryDocumentSnapshot
			),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const [
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoadingRaw,
		outgoingOffersQuerySnapshotError,
	] = useCollection(outgoingQuery)

	const [
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoadingRaw,
		incomingOffersQuerySnapshotError,
	] = useCollection(incomingQuery)

	// Report loading only when:
	// 1. Dependencies are still loading, OR
	// 2. Query was successfully built AND is still loading from Firestore
	// When dependencies are loaded but query is undefined (not logged in, no player doc, etc.),
	// we should NOT spin forever - show empty state instead
	const outgoingOffersQuerySnapshotLoading =
		dependenciesLoading ||
		(outgoingQuery !== undefined && outgoingOffersQuerySnapshotLoadingRaw)
	const incomingOffersQuerySnapshotLoading =
		dependenciesLoading ||
		(incomingQuery !== undefined && incomingOffersQuerySnapshotLoadingRaw)

	// Log and notify on offers query errors
	useEffect(() => {
		const errors = [
			{ error: outgoingOffersQuerySnapshotError, name: 'outgoing offers' },
			{ error: incomingOffersQuerySnapshotError, name: 'incoming offers' },
		].filter((e) => e.error)

		errors.forEach(({ error, name }) => {
			if (error) {
				logger.error(`Failed to load ${name}:`, {
					component: 'OffersContextProvider',
					error: error.message,
				})
				toast.error(`Failed to load ${name}`, {
					description: error.message,
				})
			}
		})
	}, [outgoingOffersQuerySnapshotError, incomingOffersQuerySnapshotError])

	return (
		<OffersContext.Provider
			value={{
				outgoingOffersQuerySnapshot: outgoingOffersQuerySnapshot as
					| QuerySnapshot<OfferDocument>
					| undefined,
				outgoingOffersQuerySnapshotLoading,
				outgoingOffersQuerySnapshotError,
				incomingOffersQuerySnapshot: incomingOffersQuerySnapshot as
					| QuerySnapshot<OfferDocument>
					| undefined,
				incomingOffersQuerySnapshotLoading,
				incomingOffersQuerySnapshotError,
				dependenciesLoading,
			}}
		>
			{children}
		</OffersContext.Provider>
	)
}
