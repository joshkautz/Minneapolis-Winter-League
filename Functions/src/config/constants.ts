/**
 * Application constants and configuration
 */

import {
	getDropboxSignApiKey,
	getENV,
	getStripeSecretKey,
	getStripeWebhookSecret,
} from './environment.js'

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
	REGISTERED_TEAMS_FOR_LOCK: 12,
	/**
	 * Smallest team contribution accepted, in cents. Below this the card
	 * processing fee takes a disproportionate share of the money.
	 */
	MIN_CONTRIBUTION_CENTS: 1_000,
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
	return {
		// A getter, so the secret is read (and its absence warned about) only
		// by code that uses it.
		get API_KEY(): string {
			return getDropboxSignApiKey()
		},
		TEMPLATE_ID: '2ea9b881ec6798e7c6122ebaa51baf50689c573c',
		TEST_MODE: !getENV().isProduction,
	} as const
}

// Stripe Configuration (lazy-loaded)
export function getStripeConfig(): {
	readonly SECRET_KEY: string
	readonly WEBHOOK_SECRET: string
	readonly API_VERSION: '2026-08-26.dahlia'
} {
	return {
		// Getters, so a function that declares only STRIPE_SECRET_KEY never
		// reads, or warns about, the webhook secret it was not given.
		get SECRET_KEY(): string {
			return getStripeSecretKey()
		},
		get WEBHOOK_SECRET(): string {
			return getStripeWebhookSecret()
		},
		API_VERSION: '2026-08-26.dahlia' as const,
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
