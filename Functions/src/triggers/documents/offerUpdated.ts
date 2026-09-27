/**
 * Offer document update trigger
 *
 * Side effects of accepting an offer:
 *  - Add the player to the team's roster subcollection for the offer's season
 *  - Update the player's season subdoc to point at the new team
 *  - Cancel any other pending offers for that player in that season
 *  - Email whoever sent the offer that it was accepted, and the captains of
 *    the teams whose offers were canceled that the player joined elsewhere
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	OfferDocument,
	OfferStatus,
} from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { playerSeasonRef, teamSeasonRef } from '../../shared/database.js'
import { addPlayerToTeam } from '../../shared/membership.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import {
	queueOfferAnsweredEmails,
	queuePlayerJoinedElsewhereEmails,
	readTeamOfferContext,
} from '../../email/teamOfferEmails.js'

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

		// Only process when status changes to ACCEPTED
		if (
			beforeData?.status !== OfferStatus.PENDING ||
			afterData?.status !== OfferStatus.ACCEPTED
		) {
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

				// The player's other pending offers this season, to cancel. Read
				// in the transaction, before any write, like everything below.
				const otherPendingOffers = (
					await transaction.get(
						firestore
							.collection(Collections.OFFERS)
							.where('player', '==', playerCanonicalRef)
							.where('season', '==', seasonRef)
							.where('status', '==', OfferStatus.PENDING)
					)
				).docs.filter((doc) => doc.id !== offerId)

				// Read what the emails need.
				const emailContext = await readTeamOfferContext(
					transaction,
					firestore,
					{ playerId, teamId, seasonId }
				)
				const otherEmailContexts = await Promise.all(
					otherPendingOffers.map((doc) =>
						readTeamOfferContext(transaction, firestore, {
							playerId,
							teamId: (doc.data() as OfferDocument).team.id,
							seasonId,
						})
					)
				)

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
				queueOfferAnsweredEmails(transaction, firestore, {
					type: offerData.type,
					accepted: true,
					context: emailContext,
				})

				// Cancel all other pending offers for this player in this season,
				// telling each of those teams' captains why.
				otherPendingOffers.forEach((doc, i) => {
					transaction.update(doc.ref, {
						status: OfferStatus.CANCELED,
						respondedAt: FieldValue.serverTimestamp(),
						respondedBy: playerCanonicalRef,
						canceledReason:
							'Player joined another team by accepting a different offer',
					})
					queuePlayerJoinedElsewhereEmails(transaction, firestore, {
						type: (doc.data() as OfferDocument).type,
						context: otherEmailContexts[i],
						joinedTeamName: emailContext.teamName,
					})
				})

				logger.info(`Successfully processed offer acceptance: ${offerId}`, {
					canceledPendingOffers: otherPendingOffers.length,
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
					processingFailedAt: FieldValue.serverTimestamp(),
				})
		}
	}
)
