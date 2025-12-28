/**
 * Stripe payment utilities
 *
 * Provides helper functions for getting Stripe configuration from Season documents.
 */

import type { SeasonDocument } from '@/types'
import { isDevelopment } from '@/shared/utils'

/**
 * Get the Stripe price ID from a season document based on environment
 *
 * @param seasonData - The season document data
 * @returns The appropriate price ID for the current environment, or null if not configured
 */
export const getSeasonPriceId = (
	seasonData: SeasonDocument | undefined
): string | null => {
	if (!seasonData?.stripe?.priceId) {
		return null
	}

	// Use dev price ID if available and in development
	if (isDevelopment() && seasonData.stripe.priceIdDev) {
		return seasonData.stripe.priceIdDev
	}

	return seasonData.stripe.priceId
}

/**
 * Get the returning player coupon ID from a season document based on environment
 *
 * @param seasonData - The season document data
 * @returns The appropriate coupon ID for the current environment, or null if not configured
 */
export const getSeasonCouponId = (
	seasonData: SeasonDocument | undefined
): string | null => {
	if (!seasonData?.stripe?.returningPlayerCouponId) {
		return null
	}

	// Use dev coupon ID if available and in development
	if (isDevelopment() && seasonData.stripe.returningPlayerCouponIdDev) {
		return seasonData.stripe.returningPlayerCouponIdDev
	}

	return seasonData.stripe.returningPlayerCouponId
}
