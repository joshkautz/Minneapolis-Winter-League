import { getPlayerSnapshot } from '@/firebase'
import { QuerySnapshot, QueryDocumentSnapshot } from '@firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OfferDocument, TeamDocument, logger } from '@/shared/utils'
import { DocumentReference } from 'firebase/firestore'
import { toast } from 'sonner'

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

	// Track keys currently being processed to prevent duplicate requests
	const processingKeysRef = useRef<Set<string>>(new Set())

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

		// Skip if already cached or currently processing
		if (
			enrichedOffersMap.has(snapshotKey) ||
			processingKeysRef.current.has(snapshotKey)
		) {
			return
		}

		// Mark as processing to prevent duplicate requests
		const currentKey = snapshotKey
		processingKeysRef.current.add(currentKey)

		Promise.all(
			offersQuerySnapshot.docs.map(
				async (offer: QueryDocumentSnapshot<OfferDocument>, index: number) => {
					const offerData = offer.data()

					// Get both player and creator data with graceful error handling
					// If a player lookup fails, we still show the offer with fallback name
					let playerName = 'Unknown Player'
					let creatorName = 'Unknown'

					try {
						const [playerSnapshot, creatorSnapshot] = await Promise.all([
							getPlayerSnapshot(offerData.player),
							offerData.createdBy
								? getPlayerSnapshot(offerData.createdBy)
								: Promise.resolve(null),
						])

						const playerData = playerSnapshot.data()
						if (playerData) {
							playerName = `${playerData.firstname} ${playerData.lastname}`
						}

						if (creatorSnapshot) {
							const creatorData = creatorSnapshot.data()
							if (creatorData) {
								creatorName = `${creatorData.firstname} ${creatorData.lastname}`
							}
						}
					} catch (error) {
						// Log error but continue with fallback names
						logger.error('Failed to fetch player data for offer:', { error })
					}

					return {
						...offerData,
						playerName,
						teamName:
							teamsQuerySnapshot?.docs
								.find(
									(team: QueryDocumentSnapshot<TeamDocument>) =>
										team.id === offerData.team.id
								)
								?.data().name || '',
						creatorName,
						ref: offersQuerySnapshot.docs[index].ref,
					} as OfferDocumentWithUI
				}
			)
		)
			.then((updatedOffers: OfferDocumentWithUI[]) => {
				setEnrichedOffersMap((prev) => {
					const next = new Map(prev)
					next.set(currentKey, updatedOffers)
					return next
				})
			})
			.catch((error) => {
				// Handle any unexpected errors in the mapping process
				logger.error('Failed to enrich offers:', { error })
				toast.error('Failed to load offer details', {
					description:
						'Some offer information may be incomplete. Please refresh to try again.',
				})
				// Set empty array to prevent infinite loading
				setEnrichedOffersMap((prev) => {
					const next = new Map(prev)
					next.set(currentKey, [])
					return next
				})
			})
			.finally(() => {
				// Clean up processing tracker
				processingKeysRef.current.delete(currentKey)
			})
		// Note: enrichedOffersMap is not in deps - we use processingKeysRef to prevent duplicates
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [offersQuerySnapshot, teamsQuerySnapshot, snapshotKey])

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
