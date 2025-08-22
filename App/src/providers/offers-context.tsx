// React
import { PropsWithChildren, createContext, useContext } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import {
	outgoingOffersQuery,
	incomingOffersQuery,
	DocumentData,
	FirestoreError,
	QuerySnapshot,
} from '@/firebase/firestore'
import { useAuthContext } from './auth-context'
import { OfferData } from '@/shared/utils'
import { useSeasonsContext } from './seasons-context'

interface OffersProps {
	outgoingOffersQuerySnapshot:
		| QuerySnapshot<OfferData, DocumentData>
		| undefined
	outgoingOffersQuerySnapshotLoading: boolean
	outgoingOffersQuerySnapshotError: FirestoreError | undefined
	incomingOffersQuerySnapshot:
		| QuerySnapshot<OfferData, DocumentData>
		| undefined
	incomingOffersQuerySnapshotLoading: boolean
	incomingOffersQuerySnapshotError: FirestoreError | undefined
}

export const OffersContext = createContext<OffersProps>({
	outgoingOffersQuerySnapshot: undefined,
	outgoingOffersQuerySnapshotLoading: false,
	outgoingOffersQuerySnapshotError: undefined,
	incomingOffersQuerySnapshot: undefined,
	incomingOffersQuerySnapshotLoading: false,
	incomingOffersQuerySnapshotError: undefined,
})

export const useOffersContext = () => useContext(OffersContext)

export const OffersContextProvider: React.FC<PropsWithChildren> = ({
	children,
}) => {
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

	return (
		<OffersContext.Provider
			value={{
				outgoingOffersQuerySnapshot: outgoingOffersQuerySnapshot as
					| QuerySnapshot<OfferData, DocumentData>
					| undefined,
				outgoingOffersQuerySnapshotLoading: outgoingOffersQuerySnapshotLoading,
				outgoingOffersQuerySnapshotError: outgoingOffersQuerySnapshotError,
				incomingOffersQuerySnapshot: incomingOffersQuerySnapshot as
					| QuerySnapshot<OfferData, DocumentData>
					| undefined,
				incomingOffersQuerySnapshotLoading: incomingOffersQuerySnapshotLoading,
				incomingOffersQuerySnapshotError: incomingOffersQuerySnapshotError,
			}}
		>
			{children}
		</OffersContext.Provider>
	)
}
