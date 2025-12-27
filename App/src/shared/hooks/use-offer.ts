import { getPlayerSnapshot } from '@/firebase'
import { QuerySnapshot, QueryDocumentSnapshot } from '@firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { OfferDocument, TeamDocument } from '@/shared/utils'
import { DocumentReference } from 'firebase/firestore'

// Extended OfferDocument with UI-specific fields for display
export interface OfferDocumentWithUI extends OfferDocument {
	/** Resolved player name for display (populated by frontend) */
	playerName: string
	/** Resolved team name for display (populated by frontend) */
	teamName: string
	/** Resolved creator name for display (populated by frontend) */
	creatorName: string
	/** Document reference for actions */
	ref: DocumentReference<OfferDocument>
}

export const useOffer = (
	offersQuerySnapshot: QuerySnapshot<OfferDocument> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
) => {
	// Store enriched offers keyed by snapshot key for proper cache invalidation
	const [enrichedOffersMap, setEnrichedOffersMap] = useState<
		Map<string, OfferDocumentWithUI[]>
	>(new Map())

	// Derive whether we have the required data
	const hasRequiredData = Boolean(offersQuerySnapshot && teamsQuerySnapshot)
	const hasOffers = Boolean(
		offersQuerySnapshot && offersQuerySnapshot.docs.length > 0
	)

	// Create a stable key for the current snapshot to detect changes
	const snapshotKey = useMemo(() => {
		if (!offersQuerySnapshot) return null
		return offersQuerySnapshot.docs.map((d) => d.id).join(',')
	}, [offersQuerySnapshot])

	// Check if we already have enriched data for this snapshot
	const cachedOffers = snapshotKey ? enrichedOffersMap.get(snapshotKey) : null

	useEffect(() => {
		// If we don't have both snapshots or no offers, nothing to process
		if (!offersQuerySnapshot || !teamsQuerySnapshot || !snapshotKey) {
			return
		}

		if (offersQuerySnapshot.docs.length === 0) {
			// Empty offers - no async work needed
			return
		}

		// If we already have cached data for this key, skip processing
		if (enrichedOffersMap.has(snapshotKey)) {
			return
		}

		// Capture current key in closure for async callback
		const currentKey = snapshotKey

		Promise.all(
			offersQuerySnapshot.docs.map(
				async (offer: QueryDocumentSnapshot<OfferDocument>, index: number) => {
					const offerData = offer.data()

					// Get both player and creator data
					const [playerSnapshot, creatorSnapshot] = await Promise.all([
						getPlayerSnapshot(offerData.player),
						offerData.createdBy ? getPlayerSnapshot(offerData.createdBy) : null,
					])

					return {
						...offerData,
						playerName: `${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`,
						teamName:
							teamsQuerySnapshot?.docs
								.find(
									(team: QueryDocumentSnapshot<TeamDocument>) =>
										team.id === offerData.team.id
								)
								?.data().name || '',
						creatorName: creatorSnapshot
							? `${creatorSnapshot.data()?.firstname} ${creatorSnapshot.data()?.lastname}`
							: 'Unknown',
						ref: offersQuerySnapshot.docs[index].ref,
					} as OfferDocumentWithUI
				}
			)
		).then((updatedOffers: OfferDocumentWithUI[]) => {
			setEnrichedOffersMap((prev) => {
				const next = new Map(prev)
				next.set(currentKey, updatedOffers)
				return next
			})
		})
	}, [offersQuerySnapshot, teamsQuerySnapshot, snapshotKey, enrichedOffersMap])

	// Derive the final offers value
	const offers = useMemo(() => {
		// No required data yet - return undefined
		if (!hasRequiredData) return undefined
		// Has data but no offers - return empty array
		if (!hasOffers) return []
		// Return cached enriched offers (may be undefined while processing)
		return cachedOffers ?? undefined
	}, [hasRequiredData, hasOffers, cachedOffers])

	// Loading when we have offers to process but haven't finished yet
	const offersLoading =
		hasOffers && snapshotKey !== null && !enrichedOffersMap.has(snapshotKey)

	return { offers, offersLoading }
}
