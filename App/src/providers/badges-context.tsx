// React
import { PropsWithChildren, createContext, useContext, useEffect } from 'react'

// Firebase Hooks
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'

// Winter League
import { FirestoreError, QuerySnapshot } from '@/firebase/firestore'
import { allBadgesQuery } from '@/firebase/collections/badges'
import { BadgeDocument } from '@/types'
import { logger } from '@/shared/utils'

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

	// Log and notify on badges query errors
	useEffect(() => {
		if (allBadgesQuerySnapshotError) {
			logger.error('Failed to load badges:', {
				component: 'BadgesContextProvider',
				error: allBadgesQuerySnapshotError.message,
			})
			toast.error('Failed to load badges', {
				description: allBadgesQuerySnapshotError.message,
			})
		}
	}, [allBadgesQuerySnapshotError])

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
