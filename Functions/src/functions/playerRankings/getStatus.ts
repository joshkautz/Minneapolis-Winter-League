/**
 * Calculation status monitoring Firebase Function
 *
 * This function allows monitoring the progress of any Player Rankings calculation
 */

import { getFirestore } from 'firebase-admin/firestore'
import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { Collections } from '../../types.js'

// Validation schema
const statusRequestSchema = z.object({
	calculationId: z.string(),
})

type StatusRequest = z.infer<typeof statusRequestSchema>

/**
 * Get calculation status function (for monitoring progress)
 */
export const getCalculationStatus = onCall(
	{ region: 'us-central1' },
	async (request: CallableRequest<StatusRequest>) => {
		if (!request.auth) {
			throw new Error('Authentication required')
		}

		const { calculationId } = statusRequestSchema.parse(request.data)

		const firestore = getFirestore()
		const calculationDoc = await firestore
			.collection(Collections.RANKINGS_CALCULATIONS)
			.doc(calculationId)
			.get()

		if (!calculationDoc.exists) {
			throw new Error('Calculation not found')
		}

		return calculationDoc.data()
	}
)
