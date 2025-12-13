// React
import { PropsWithChildren, createContext, useContext, useEffect } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'

// Winter League
import {
	outgoingOffersQuery,
	incomingOffersQuery,
	FirestoreError,
	QuerySnapshot,
} from '@/firebase/firestore'
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
}

// eslint-disable-next-line react-refresh/only-export-components
export const OffersContext = createContext<OffersProps>({
	outgoingOffersQuerySnapshot: undefined,
	outgoingOffersQuerySnapshotLoading: false,
	outgoingOffersQuerySnapshotError: undefined,
	incomingOffersQuerySnapshot: undefined,
	incomingOffersQuerySnapshotLoading: false,
	incomingOffersQuerySnapshotError: undefined,
})

// eslint-disable-next-line react-refresh/only-export-components
export const useOffersContext = () => useContext(OffersContext)

export const OffersContextProvider = ({ children }: PropsWithChildren) => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoading,
		outgoingOffersQuerySnapshotError,
	] = useCollection(
		outgoingOffersQuery(
			authenticatedUserSnapshot,
			currentSeasonQueryDocumentSnapshot
		)
	)

	const [
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoading,
		incomingOffersQuerySnapshotError,
	] = useCollection(
		incomingOffersQuery(
			authenticatedUserSnapshot,
			currentSeasonQueryDocumentSnapshot
		)
	)

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
				outgoingOffersQuerySnapshotLoading: outgoingOffersQuerySnapshotLoading,
				outgoingOffersQuerySnapshotError: outgoingOffersQuerySnapshotError,
				incomingOffersQuerySnapshot: incomingOffersQuerySnapshot as
					| QuerySnapshot<OfferDocument>
					| undefined,
				incomingOffersQuerySnapshotLoading: incomingOffersQuerySnapshotLoading,
				incomingOffersQuerySnapshotError: incomingOffersQuerySnapshotError,
			}}
		>
			{children}
		</OffersContext.Provider>
	)
}
