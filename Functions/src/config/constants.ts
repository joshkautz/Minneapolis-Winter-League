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
} as const

// Business Logic Constants (static)
// The registration limits (signed players, spots, the smallest contribution)
// are in shared/teamPaymentRules.ts, which the App shares; import them from
// there.
export const TEAM_CONFIG = {
	/**
	 * How long a Checkout session stays open. Kept as short as Stripe allows,
	 * because the balance a contribution was validated against goes stale
	 * while the session is open. Stripe's floor is thirty minutes, measured
	 * against its own clock; the extra minute keeps drift in ours from
	 * putting the value under the floor, which would fail every checkout.
	 *
	 * It is also how long after registration closes a payment can still
	 * complete a team: a checkout opened just before the close can be paid
	 * this long after it (see shared/registrationWindow.ts).
	 */
	CHECKOUT_SESSION_LIFETIME_SECONDS: 31 * 60,
} as const

// Email Configuration
export const EMAIL_CONFIG = {
	FROM: 'Minneapolis Winter League <notifications@mplswinterleague.com>',
	/** Replies reach the organizers, not an unread mailbox. */
	REPLY_TO: 'leadership@mplsmallard.com',
	SITE_URL: 'https://mplswinterleague.com',
	/**
	 * The postal address CAN-SPAM requires in every announcement: a street
	 * address, a USPS PO box or a private mailbox. Announcements are refused
	 * while it is unset.
	 */
	POSTAL_ADDRESS: '4316 Glencrest Road, Golden Valley, MN 55416' as
		string | null,
} as const

// Where the league plays. The home page links the same map.
export const VENUE = {
	NAME: 'URW Sports Field Complex',
	MAP_URL: 'https://maps.app.goo.gl/avAamyReCbGmz8jWA',
} as const

// When and where games are played: shared/gameRules.ts, which the App shares.

/**
 * The Stripe API version the code is written against. The webhook endpoint
 * must be on the same one; see .claude/rules/functions.md before moving it.
 */
export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const

// Stripe Configuration (lazy-loaded)
export function getStripeConfig(): {
	readonly SECRET_KEY: string
	readonly WEBHOOK_SECRET: string
	readonly API_VERSION: typeof STRIPE_API_VERSION
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
		API_VERSION: STRIPE_API_VERSION,
	} as const
}
