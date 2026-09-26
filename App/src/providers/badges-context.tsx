// React
import { PropsWithChildren, createContext, useContext } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import { type FirestoreError, type QuerySnapshot } from 'firebase/firestore'
import { allBadgesQuery } from '@/firebase/collections/badges'
import { BadgeDocument } from '@/types'
import { useQueryErrorHandler } from '@/shared/hooks/use-query-error-handler'

interface BadgeProps {
	allBadgesQuerySnapshot: QuerySnapshot<BadgeDocument> | undefined
	allBadgesQuerySnapshotLoading: boolean
	allBadgesQuerySnapshotError: FirestoreError | undefined
}

const BadgesContext = createContext<BadgeProps | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useBadgesContext = (): BadgeProps => {
	const context = useContext(BadgesContext)
	if (!context) {
		throw new Error(
			'useBadgesContext must be used within a BadgesContextProvider'
		)
	}
	return context
}

export const BadgesContextProvider = ({ children }: PropsWithChildren) => {
	const [
		allBadgesQuerySnapshot,
		allBadgesQuerySnapshotLoading,
		allBadgesQuerySnapshotError,
	] = useCollection(allBadgesQuery())

	useQueryErrorHandler({
		error: allBadgesQuerySnapshotError,
		component: 'BadgesContextProvider',
		errorLabel: 'badges',
	})

	return (
		<BadgesContext.Provider
			value={{
				allBadgesQuerySnapshot,
				allBadgesQuerySnapshotLoading,
				allBadgesQuerySnapshotError,
			}}
		>
			{children}
		</BadgesContext.Provider>
	)
}
