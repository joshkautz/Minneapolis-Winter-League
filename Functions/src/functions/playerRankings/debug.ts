/**
 * Debug functions for examining calculated rounds and round status
 */

import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { getFirestore } from 'firebase-admin/firestore'
import { z } from 'zod'
import { Collections } from '../../types.js'
import {
	getCalculatedRoundsForSeason,
	getLastCalculatedRoundTime,
	groupGamesByRounds,
	loadGamesForCalculation,
} from '../../services/playerRankings/index.js'

// Validation schema for round status check
const roundStatusSchema = z.object({
	seasonId: z.string().optional(),
})

type RoundStatusRequest = z.infer<typeof roundStatusSchema>

/**
 * Get information about calculated rounds
 */
export const getRoundCalculationStatus = onCall(
	{
		region: 'us-central1',
	},
	async (request: CallableRequest<RoundStatusRequest>) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new Error('Authentication required')
			}

			// Check if user is admin
			const firestore = getFirestore()
			const playerDoc = await firestore
				.collection(Collections.PLAYERS)
				.doc(request.auth.uid)
				.get()

			if (!playerDoc.exists || !playerDoc.data()?.admin) {
				throw new Error('Admin privileges required')
			}

			const { seasonId } = request.data || {}

			// Get last calculated round time
			const lastCalculatedTime = await getLastCalculatedRoundTime()

			if (seasonId) {
				// Get calculated rounds for specific season
				const calculatedRounds = await getCalculatedRoundsForSeason(seasonId)

				return {
					seasonId,
					calculatedRounds: calculatedRounds.length,
					rounds: calculatedRounds.map((round) => ({
						roundId: round.roundId,
						startTime: round.roundStartTime.toDate().toISOString(),
						gameCount: round.gameCount,
						calculatedAt: round.calculatedAt.toDate().toISOString(),
					})),
					lastCalculatedTime: lastCalculatedTime?.toISOString() || null,
				}
			} else {
				// Get overall status
				// Load all seasons and games to get round information
				const seasonsSnapshot = await firestore
					.collection(Collections.SEASONS)
					.orderBy('dateStart', 'asc')
					.get()

				const seasons = seasonsSnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}))

				const allGames = await loadGamesForCalculation(seasons as any, 0)
				const allRounds = groupGamesByRounds(allGames)

				// Get calculated rounds count
				const calculatedRoundsSnapshot = await firestore
					.collection(Collections.CALCULATED_ROUNDS)
					.get()

				return {
					totalRounds: allRounds.length,
					calculatedRounds: calculatedRoundsSnapshot.size,
					uncalculatedRounds: allRounds.length - calculatedRoundsSnapshot.size,
					lastCalculatedTime: lastCalculatedTime?.toISOString() || null,
					roundsByDate: allRounds.reduce(
						(acc, round) => {
							const dateKey = round.startTime.toISOString().split('T')[0]
							if (!acc[dateKey]) acc[dateKey] = 0
							acc[dateKey]++
							return acc
						},
						{} as Record<string, number>
					),
				}
			}
		} catch (error) {
			logger.error('Error getting round calculation status:', error)
			throw error
		}
	}
)
