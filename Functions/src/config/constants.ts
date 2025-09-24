/**
 * Application constants and configuration
 */

import { getENV } from './environment.js'

// Firebase Configuration (static - no env vars needed)
export const FIREBASE_CONFIG = {
	REGION: 'us-central1',
	CORS_ORIGINS: ['https://mplswinterleague.com'],
} as const

// Business Logic Constants (static)
export const TEAM_CONFIG = {
	MIN_PLAYERS_FOR_REGISTRATION: 10,
} as const

// Dropbox Sign Configuration (lazy-loaded)
export function getDropboxSignConfig() {
	const env = getENV()
	return {
		API_KEY: env.dropboxSignApiKey,
		TEMPLATE_ID: '2ea9b881ec6798e7c6122ebaa51baf50689c573c',
		TEST_MODE: !env.isProduction,
	} as const
}

// Stripe Configuration (lazy-loaded)
export function getStripeConfig() {
	const env = getENV()
	return {
		SECRET_KEY: env.stripeSecretKey,
		API_VERSION: '2025-08-27.basil' as const,
	} as const
}

// Email Configuration
export const EMAIL_CONFIG = {
	WAIVER_SUBJECT: 'Minneapolis Winter League - Release of Liability',
	WAIVER_MESSAGE:
		"We're so excited you decided to join Minneapolis Winter League. " +
		'Please make sure to sign this Release of Liability to finalize ' +
		'your participation. Looking forward to seeing you!',
} as const
