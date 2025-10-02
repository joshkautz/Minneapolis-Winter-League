/**
 * Offer document update trigger
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	OfferDocument,
	PlayerDocument,
	SeasonDocument,
	TeamDocument,
	TeamRosterPlayer,
} from '../../types.js'
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
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new Error('No current season found')
				}

				// Get offer data
				const offerRef = firestore
					.collection(Collections.OFFERS)
					.doc(offerId) as DocumentReference<OfferDocument>
				const offerDoc = await transaction.get(offerRef)

				if (!offerDoc.exists) {
					throw new Error('Offer not found')
				}

				const offerData = offerDoc.data()
				if (!offerData) {
					throw new Error('Invalid offer data')
				}

				const { player: playerRef, team: teamRef } = offerData

				// Get player and team documents
				const [playerDoc, teamDoc] = await Promise.all([
					playerRef.get(),
					teamRef.get(),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					throw new Error('Player or team not found')
				}

				const playerDocument = playerDoc.data() as PlayerDocument | undefined
				const teamDocument = teamDoc.data() as TeamDocument | undefined

				if (!playerDocument || !teamDocument) {
					throw new Error('Unable to retrieve player or team data')
				} // Check if player is already on a team for current season
				const currentSeasonData = playerDocument.seasons?.find(
					(season) => season.season.id === currentSeason.id
				)

				if (currentSeasonData?.team) {
					throw new Error('Player is already on a team for this season')
				}

				// Check if player has lookingForTeam status for karma bonus
				// Locked players are treated as lookingForTeam: false for karma purposes
				const isLookingForTeam =
					(currentSeasonData?.lookingForTeam || false) &&
					!currentSeasonData?.locked
				const currentKarma = teamDocument.karma || 0

				// Add player to team roster
				const newRosterMember: TeamRosterPlayer = {
					player: playerRef,
					captain: false, // Players joining via offers are not captains
					dateJoined: Timestamp.now(),
				}

				const updatedRoster = [...(teamDocument.roster || []), newRosterMember]

				// Update team with new roster and karma bonus if applicable
				const teamUpdates: Partial<TeamDocument> = {
					roster: updatedRoster,
				}

				if (isLookingForTeam) {
					teamUpdates.karma = currentKarma + 100
				}

				transaction.update(teamRef, teamUpdates)

				// Update player's season data
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(currentSeason.id) as DocumentReference<SeasonDocument>

				const existingSeasonIndex =
					playerDocument.seasons?.findIndex(
						(season) => season.season.id === currentSeason.id
					) ?? -1

				let updatedSeasons = playerDocument.seasons || []

				if (existingSeasonIndex >= 0) {
					// Update existing season data
					// Note: locked and lookingForTeam are permanent once set, so we preserve them
					updatedSeasons[existingSeasonIndex] = {
						...updatedSeasons[existingSeasonIndex],
						team: teamRef,
						captain: false, // Players joining via offers are not captains
						// Don't modify locked or lookingForTeam - they're permanent once set
					}
				} else {
					// Create new season data if none exists
					const newSeasonData = {
						season: seasonRef,
						team: teamRef,
						captain: false, // Players joining via offers are not captains
						paid: false,
						signed: false,
						banned: false,
						lookingForTeam: false, // Initial value - not yet locked
						locked: false, // Initial value - not yet locked
					}
					updatedSeasons = [...updatedSeasons, newSeasonData]
				}

				transaction.update(playerRef, { seasons: updatedSeasons })

				// Mark offer as processed
				transaction.update(offerRef, { processed: true })

				logger.info(`Successfully processed offer acceptance: ${offerId}`, {
					karmaBonus: isLookingForTeam ? 100 : 0,
				})
			})
		} catch (error) {
			logger.error(`Error processing offer acceptance: ${offerId}`, error)

			// Mark the offer as failed but preserve the accepted status
			// This allows admins to see the user's intent and retry processing
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
