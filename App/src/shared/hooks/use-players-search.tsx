import { PlayerDocument } from '@/shared/utils'
import {
	FirestoreError,
	getDocsFromServer,
	Query,
	QuerySnapshot,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'

export const usePlayersSearch = (
	playersQuery: Query<PlayerDocument> | undefined
) => {
	const [playersQuerySnapshot, setPlayersQuerySnapshot] = useState<
		QuerySnapshot<PlayerDocument> | undefined
	>()
	const [playersQuerySnapshotLoading, setPlayersQuerySnapshotLoading] =
		useState<boolean>(true)
	const [playersQuerySnapshotError, setPlayersQuerySnapshotError] = useState<
		FirestoreError | undefined
	>()

	useEffect(() => {
		if (!playersQuery) {
			setPlayersQuerySnapshotLoading(false)
			return undefined
		}

		setPlayersQuerySnapshotLoading(true)

		getDocsFromServer(playersQuery)
			.then((querySnapshot) => {
				setPlayersQuerySnapshot(querySnapshot)
				setPlayersQuerySnapshotLoading(false)
			})
			.catch((error) => {
				setPlayersQuerySnapshotError(error)
				setPlayersQuerySnapshotLoading(false)
			})
	}, [playersQuery])

	return {
		playersQuerySnapshot,
		playersQuerySnapshotLoading,
		playersQuerySnapshotError,
	}
}
