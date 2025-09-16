/**
 * Helper function for triggering iterative round-based calculations
 * This allows administrators to easily run calculations that process only new rounds
 */

import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { getFirestore } from 'firebase-admin/firestore'
import { z } from 'zod'
import { Collections } from '../../types.js'
import { calculateHallOfFameRankings } from './calculate.js'

// Validation schema for iterative calculations
const iterativeCalculationSchema = z.object({
	/** Whether to only process new rounds that haven't been calculated yet */
	onlyNewRounds: z.boolean().default(true),
	/** Whether to apply rating decay */
	applyDecay: z.boolean().default(true),
})

type IterativeCalculationRequest = z.infer<typeof iterativeCalculationSchema>

/**
 * Iterative Hall of Fame calculation function
 * This processes only new rounds that haven't been calculated yet
 */
export const calculateHallOfFameIterative = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes
		memory: '1GiB',
	},
	async (request: CallableRequest<IterativeCalculationRequest>) => {
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

			// Validate request data
			const validatedData = iterativeCalculationSchema.parse(request.data)
			const { onlyNewRounds, applyDecay } = validatedData

			logger.info('Starting iterative Hall of Fame calculation', {
				triggeredBy: request.auth.uid,
				onlyNewRounds,
				applyDecay,
			})

			// Call the main calculation function with round-based processing
			const calculationRequest: CallableRequest<any> = {
				...request,
				data: {
					calculationType: 'round-based',
					onlyNewRounds,
					applyDecay,
				},
			}

			return await calculateHallOfFameRankings.run(calculationRequest)
		} catch (error) {
			logger.error('Error starting iterative Hall of Fame calculation:', error)
			throw error
		}
	}
)
