/**
 * Application constants and configuration
 */

import { getENV } from './environment.js'

// Firebase Configuration (static - no env vars needed)
export const FIREBASE_CONFIG = {
	REGION: 'us-central1',
	CORS_ORIGINS: [
		'https://mplswinterleague.com',
		'https://www.mplswinterleague.com',
	],
} as const

// Business Logic Constants (static)
export const TEAM_CONFIG = {
	MIN_PLAYERS_FOR_REGISTRATION: 10,
} as const

// Game Configuration
export const GAME_CONFIG = {
	ALLOWED_TIME_SLOTS: ['18:00', '18:45', '19:30', '20:15'],
	ALLOWED_FIELDS: [1, 2, 3],
	ALLOWED_MONTHS: [11, 12], // November and December
} as const

// Badge Configuration
export const BADGE_CONFIG = {
	NAME_MIN_LENGTH: 3,
	NAME_MAX_LENGTH: 100,
	DESCRIPTION_MIN_LENGTH: 10,
	DESCRIPTION_MAX_LENGTH: 500,
	MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
} as const

// Dropbox Sign Configuration (lazy-loaded)
export function getDropboxSignConfig(): {
	readonly API_KEY: string
	readonly TEMPLATE_ID: string
	readonly TEST_MODE: boolean
} {
	const env = getENV()
	return {
		API_KEY: env.dropboxSignApiKey,
		TEMPLATE_ID: '2ea9b881ec6798e7c6122ebaa51baf50689c573c',
		TEST_MODE: !env.isProduction,
	} as const
}

// Stripe Configuration (lazy-loaded)
export function getStripeConfig(): {
	readonly SECRET_KEY: string
	readonly WEBHOOK_SECRET: string
	readonly API_VERSION: '2026-01-28.clover'
} {
	const env = getENV()
	return {
		SECRET_KEY: env.stripeSecretKey,
		WEBHOOK_SECRET: env.stripeWebhookSecret,
		API_VERSION: '2026-01-28.clover' as const,
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
