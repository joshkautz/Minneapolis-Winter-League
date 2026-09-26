import { useMemo, useState } from 'react'
import { useSeasonsContext } from '@/providers'
import type { SeasonDocument } from '@/types'

/**
 * The season an admin screen is filtered to: the current season until the
 * admin picks another. Derived rather than stored — an effect seeding the
 * selection once seasons loaded rendered an empty selection first, which
 * React 19 flags as a cascading render.
 */
export const useAdminSeasonFilter = () => {
	const {
		seasonsQuerySnapshot,
		seasonsQuerySnapshotError,
		currentSeasonQueryDocumentSnapshot,
	} = useSeasonsContext()

	const [chosenSeasonId, setSelectedSeasonId] = useState<string>()
	const selectedSeasonId =
		chosenSeasonId ?? currentSeasonQueryDocumentSnapshot?.id ?? ''

	const seasons = useMemo(
		() =>
			seasonsQuerySnapshot?.docs.map(
				(doc): SeasonDocument & { id: string } => ({
					id: doc.id,
					...doc.data(),
				})
			),
		[seasonsQuerySnapshot]
	)

	const selectedSeasonSnapshot = seasonsQuerySnapshot?.docs.find(
		(doc) => doc.id === selectedSeasonId
	)

	return {
		currentSeasonId: currentSeasonQueryDocumentSnapshot?.id,
		seasons,
		seasonsError: seasonsQuerySnapshotError,
		selectedSeasonId,
		setSelectedSeasonId,
		selectedSeasonSnapshot,
	}
}
