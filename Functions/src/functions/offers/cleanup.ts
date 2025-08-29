/**
 * Cleanup offers callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../types.js'
import { validateAuthentication, validateAdminUser } from '../../shared/auth.js'

/**
 * Function to clean up expired or conflicting offers
 * Only admin users can run this cleanup
 */
export const cleanupOffers = onCall(
	{ region: 'us-central1' },
	async (request) => {
		// Validate authentication and admin privileges
		validateAuthentication(request.auth)

		const firestore = getFirestore()
		await validateAdminUser(request.auth, firestore)

		try {
			let totalDeleted = 0
			const now = new Date()

			// Clean up expired offers
			const expiredOffersQuery = await firestore
				.collection(Collections.OFFERS)
				.where('status', '==', 'pending')
				.where('expiresAt', '<', now)
				.get()

			const expiredDeletes = expiredOffersQuery.docs.map((doc) =>
				doc.ref.delete()
			)
			await Promise.all(expiredDeletes)
			totalDeleted += expiredDeletes.length

			logger.info(`Deleted ${expiredDeletes.length} expired offers`)

			// Clean up conflicting offers (player already on team)
			const pendingOffersQuery = await firestore
				.collection(Collections.OFFERS)
				.where('status', '==', 'pending')
				.get()

			const conflictingOffers = []

			for (const offerDoc of pendingOffersQuery.docs) {
				const offerData = offerDoc.data()

				// Get player data to check if they're already on a team
				const playerDoc = await offerData.player.get()
				if (playerDoc.exists) {
					const playerDocument = playerDoc.data()
					const hasTeamForSeason = playerDocument?.seasons?.some(
						(season: any) =>
							season.season.id === offerData.season && season.team
					)

					if (hasTeamForSeason) {
						conflictingOffers.push(offerDoc.ref)
					}
				}
			}

			// Delete conflicting offers
			const conflictingDeletes = conflictingOffers.map((ref) => ref.delete())
			await Promise.all(conflictingDeletes)
			totalDeleted += conflictingDeletes.length

			logger.info(`Deleted ${conflictingDeletes.length} conflicting offers`)

			// Clean up offers for non-existent players or teams
			const allOffersQuery = await firestore
				.collection(Collections.OFFERS)
				.get()

			const orphanedOffers = []

			for (const offerDoc of allOffersQuery.docs) {
				const offerData = offerDoc.data()

				try {
					const [playerDoc, teamDoc] = await Promise.all([
						offerData.player.get(),
						offerData.team.get(),
					])

					if (!playerDoc.exists || !teamDoc.exists) {
						orphanedOffers.push(offerDoc.ref)
					}
				} catch (error) {
					// If we can't fetch the documents, they're orphaned
					orphanedOffers.push(offerDoc.ref)
				}
			}

			// Delete orphaned offers
			const orphanedDeletes = orphanedOffers.map((ref) => ref.delete())
			await Promise.all(orphanedDeletes)
			totalDeleted += orphanedDeletes.length

			logger.info(`Deleted ${orphanedDeletes.length} orphaned offers`)

			logger.info(`Offer cleanup completed`, {
				totalDeleted,
				expiredDeleted: expiredDeletes.length,
				conflictingDeleted: conflictingDeletes.length,
				orphanedDeleted: orphanedDeletes.length,
				adminUser: request.auth!.uid,
			})

			return {
				success: true,
				totalDeleted,
				breakdown: {
					expired: expiredDeletes.length,
					conflicting: conflictingDeletes.length,
					orphaned: orphanedDeletes.length,
				},
				message: `Successfully cleaned up ${totalDeleted} offers`,
			}
		} catch (error) {
			logger.error('Error during offer cleanup:', {
				adminUser: request.auth!.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to cleanup offers'
			)
		}
	}
)
