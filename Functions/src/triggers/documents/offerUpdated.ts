/**
 * Offer document update trigger
 *
 * Side effects of accepting an offer:
 *  - Add the player to the team's roster subcollection for the offer's season
 *  - Update the player's season subdoc to point at the new team
 *  - Cancel any other pending offers for that player in that season
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, DocumentReference, OfferDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { playerSeasonRef, teamSeasonRef } from '../../shared/database.js'
import { addPlayerToTeam } from '../../shared/membership.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

export const onOfferUpdated = onDocumentUpdated(
	{
		document: 'offers/{offerId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		if (await isMigrationInProgress(getFirestore())) {
			logger.info('Skipping onOfferUpdated — migration in progress', {
				eventId: event.id,
				offerId: event.params.offerId,
			})
			return
		}

		const beforeData = event.data?.before.data() as OfferDocument | undefined
		const afterData = event.data?.after.data() as OfferDocument | undefined

		// Only process when status changes to 'accepted'
		if (beforeData?.status !== 'pending' || afterData?.status !== 'accepted') {
			return
		}

		const offerId = event.params.offerId
		logger.info(`Processing accepted offer: ${offerId}`)

		try {
			const firestore = getFirestore()
			await firestore.runTransaction(async (transaction) => {
				const offerRef = firestore
					.collection(Collections.OFFERS)
					.doc(offerId) as DocumentReference<OfferDocument>
				const offerDoc = await transaction.get(offerRef)
				if (!offerDoc.exists) throw new Error('Offer not found')
				const offerData = offerDoc.data()
				if (!offerData) throw new Error('Invalid offer data')

				const { player: playerCanonicalRef, team: teamCanonicalRef } = offerData
				const seasonRef = offerData.season
				const seasonId = seasonRef.id
				const playerId = playerCanonicalRef.id
				const teamId = teamCanonicalRef.id

				// Verify team season exists.
				const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
				const teamSeasonSnap = await transaction.get(teamSeasonDocRef)
				if (!teamSeasonSnap.exists) {
					throw new Error('Team is not participating in this season')
				}

				// Confirm player isn't already on a team for this season.
				const playerSeasonDocRef = playerSeasonRef(
					firestore,
					playerId,
					seasonId
				)
				const playerSeasonSnap = await transaction.get(playerSeasonDocRef)
				const existingPlayerSeason = playerSeasonSnap.data() ?? null
				if (existingPlayerSeason?.team) {
					throw new Error('Player is already on a team for this season')
				}

				// Atomic dual-write of the membership relationship.
				addPlayerToTeam(transaction, firestore, {
					playerId,
					teamId,
					seasonId,
					seasonRef,
					captain: false,
					existingPlayerSeason,
				})

				// Mark offer as processed.
				transaction.update(offerRef, { processed: true })

				// Cancel all other pending offers for this player in this season.
				const pendingOffersQuery = await firestore
					.collection(Collections.OFFERS)
					.where('player', '==', playerCanonicalRef)
					.where('season', '==', seasonRef)
					.where('status', '==', 'pending')
					.get()

				let canceledOffersCount = 0
				pendingOffersQuery.forEach((doc) => {
					if (doc.id !== offerId) {
						transaction.update(doc.ref, {
							status: 'canceled',
							respondedAt: Timestamp.now(),
							respondedBy: playerCanonicalRef,
							canceledReason:
								'Player joined another team by accepting a different offer',
						})
						canceledOffersCount++
					}
				})

				logger.info(`Successfully processed offer acceptance: ${offerId}`, {
					canceledPendingOffers: canceledOffersCount,
				})
			})
		} catch (error) {
			logger.error(`Error processing offer acceptance: ${offerId}`, error)

			const firestore = getFirestore()
			await firestore
				.collection(Collections.OFFERS)
				.doc(offerId)
				.update({
					processed: false,
					processingError:
						error instanceof Error ? error.message : 'Unknown error',
					processingFailedAt: new Date(),
				})
		}
	}
)
