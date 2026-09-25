// React
import { PropsWithChildren, createContext, useContext } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'

// Winter League
import { FirestoreError, QuerySnapshot } from '@/firebase'
import { allBadgesQuery } from '@/firebase/collections/badges'
import { BadgeDocument } from '@/types'
import { useQueryErrorHandler } from '@/shared/hooks/use-query-error-handler'

interface BadgeProps {
	allBadgesQuerySnapshot: QuerySnapshot<BadgeDocument> | undefined
	allBadgesQuerySnapshotLoading: boolean
	allBadgesQuerySnapshotError: FirestoreError | undefined
}

// eslint-disable-next-line react-refresh/only-export-components
export const BadgesContext = createContext<BadgeProps>({
	allBadgesQuerySnapshot: undefined,
	allBadgesQuerySnapshotLoading: false,
	allBadgesQuerySnapshotError: undefined,
})

// eslint-disable-next-line react-refresh/only-export-components
export const useBadgesContext = () => useContext(BadgesContext)

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
