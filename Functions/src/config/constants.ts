/**
 * Application constants and configuration
 */

import { getStripeSecretKey, getStripeWebhookSecret } from './environment.js'

// Firebase Configuration (static - no env vars needed)
export const FIREBASE_CONFIG = {
	REGION: 'us-central1',
	/**
	 * The league plays in Minneapolis: schedules run on its clock, and dates
	 * in messages are shown in it unless the caller sends its own zone.
	 * `waiver/rules.ts` holds the same value, since that file cannot import.
	 */
	TIME_ZONE: 'America/Chicago',
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
} as const

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
