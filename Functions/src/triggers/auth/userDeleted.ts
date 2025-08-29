/**
 * Firebase Authentication trigger functions
 */

import { auth } from 'firebase-functions/v1'
import { UserRecord } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '@minneapolis-winter-league/shared'
import { handleFunctionError } from '../../shared/errors.js'

/**
 * When a user is deleted via Firebase Authentication, clean up all related data
 * - Delete the player document
 * - Remove player from all team rosters
 * - Delete all related offers
 *
 * @see https://firebase.google.com/docs/functions/auth-events#trigger_a_function_on_user_deletion
 */
export const userDeleted = auth.user().onDelete(async (user: UserRecord) => {
	const { uid } = user

	try {
		logger.info(`Processing user deletion for UID: ${uid}`)

		const firestore = getFirestore()
		const playerRef = firestore.collection(Collections.PLAYERS).doc(uid)

		// Get player data to find associated teams (outside transaction first)
		const playerDoc = await playerRef.get()

		if (!playerDoc.exists) {
			logger.warn(`Player document not found for UID: ${uid}`)
			return
		}

		const playerDocument = playerDoc.data()

		// Use a transaction to ensure data consistency
		await firestore.runTransaction(async (transaction) => {
			// Remove player from all teams they've been on
			if (playerDocument?.seasons) {
				for (const season of playerDocument.seasons) {
					if (season.team) {
						const teamDocSnapshot = await season.team.get()
						if (teamDocSnapshot.exists) {
							const teamDocument = teamDocSnapshot.data()
							const updatedRoster =
								teamDocument?.roster?.filter(
									(member: any) => member.player.id !== uid
								) || []

							transaction.update(season.team, { roster: updatedRoster })
						}
					}
				}
			}

			// Delete the player document
			transaction.delete(playerRef)
		})

		// Delete all offers for this player (done outside transaction to avoid conflicts)
		const offersQuery = await firestore
			.collection(Collections.OFFERS)
			.where('player', '==', playerRef)
			.get()

		const deletePromises = offersQuery.docs.map((doc) => doc.ref.delete())
		await Promise.all(deletePromises)

		logger.info(`Successfully cleaned up data for deleted user: ${uid}`, {
			deletedOffers: deletePromises.length,
		})
	} catch (error) {
		throw handleFunctionError(error, 'userDeleted', { uid })
	}
})
