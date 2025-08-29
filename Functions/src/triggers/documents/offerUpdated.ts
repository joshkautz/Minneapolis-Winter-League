/**
 * Offer document update trigger
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '@minneapolis-winter-league/shared'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'

/**
 * Triggered when an offer document is updated
 * Handles the side effects of accepting offers (adding player to team)
 */
export const onOfferUpdated = onDocumentUpdated(
	{
		document: 'offers/{offerId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const beforeData = event.data?.before.data()
		const afterData = event.data?.after.data()

		// Only process when status changes to 'accepted'
		if (beforeData?.status !== 'pending' || afterData?.status !== 'accepted') {
			return
		}

		const offerId = event.params.offerId
		logger.info(`Processing accepted offer: ${offerId}`)

		try {
			const firestore = getFirestore()
			await firestore.runTransaction(async (transaction) => {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new Error('No current season found')
				}

				// Get offer data
				const offerRef = firestore.collection(Collections.OFFERS).doc(offerId)
				const offerDoc = await transaction.get(offerRef)
				
				if (!offerDoc.exists) {
					throw new Error('Offer not found')
				}

				const offerData = offerDoc.data()
				if (!offerData) {
					throw new Error('Invalid offer data')
				}
				
				const { player: playerRef, team: teamRef, type } = offerData

				// Get player and team documents
				const [playerDoc, teamDoc] = await Promise.all([
					playerRef.get(),
					teamRef.get(),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					throw new Error('Player or team not found')
				}

				const playerData = playerDoc.data()
				const teamData = teamDoc.data()

				// Check if player is already on a team for current season
				const currentSeasonData = playerData.seasons?.find(
					(season: any) => season.season.id === currentSeason.id
				)

				if (currentSeasonData?.team) {
					throw new Error('Player is already on a team for this season')
				}

				// Add player to team roster
				const newRosterMember = {
					player: playerRef,
					captain: type === 'invitation', // Invitations make you captain
					dateJoined: new Date(),
				}

				const updatedRoster = [...(teamData.roster || []), newRosterMember]
				transaction.update(teamRef, { roster: updatedRoster })

				// Update player's season data
				const seasonRef = firestore.collection(Collections.SEASONS).doc(currentSeason.id)
				const newSeasonData = {
					season: seasonRef,
					team: teamRef,
					captain: type === 'invitation',
					paid: false,
					signed: false,
				}

				const updatedSeasons = playerData.seasons
					? [...playerData.seasons, newSeasonData]
					: [newSeasonData]

				transaction.update(playerRef, { seasons: updatedSeasons })

				// Mark offer as processed
				transaction.update(offerRef, { processed: true })

				logger.info(`Successfully processed offer acceptance: ${offerId}`)
			})
		} catch (error) {
			logger.error(`Error processing offer acceptance: ${offerId}`, error)

			// Mark the offer as failed and revert status
			const firestore = getFirestore()
			await firestore
				.collection(Collections.OFFERS)
				.doc(offerId)
				.update({
					status: 'rejected',
					error: error instanceof Error ? error.message : 'Unknown error',
				})
		}
	}
)
