/**
 * Secrets, read at the moment code needs them.
 */

import { logger } from 'firebase-functions/v2'

export type SecretName = 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'

/**
 * Returned in place of a missing secret so functions still load without one.
 * A function that uses the placeholder fails at the provider instead.
 */
const SECRET_PLACEHOLDERS: Record<SecretName, string> = {
	STRIPE_SECRET_KEY: 'DEVELOPMENT_PLACEHOLDER_STRIPE',
	STRIPE_WEBHOOK_SECRET: 'DEVELOPMENT_PLACEHOLDER_STRIPE_WEBHOOK',
}

const warnedMissingSecrets = new Set<SecretName>()
let warnedLiveStripeKey = false

/** The Functions emulator sets this; a deployed function never sees it. */
export function isRunningInEmulator(): boolean {
	return process.env.FUNCTIONS_EMULATOR === 'true'
}

const isLiveStripeKey = (value: string): boolean =>
	value.startsWith('sk_live_') || value.startsWith('rk_live_')

/**
 * Reads one secret at the moment it is needed.
 *
 * Firebase injects only the secrets listed in a function's `secrets` option,
 * so every other secret is legitimately absent from that instance. Checking
 * them all together logged a warning for each undeclared one on every cold
 * start; checking per read means a warning points at a secret some code
 * actually tried to use. It is logged once per instance, not per read.
 *
 * In production the value is a Firebase secret; under the emulator it comes
 * from `Functions/.secret.local` — or, when it is not there, from production
 * Secret Manager with the developer's own credentials, since the emulator
 * runs against the production project. That is how a seeded emulator once
 * sent real Dropbox Sign emails. So the emulator never uses a live Stripe
 * key: put a test-mode key in `.secret.local` to exercise payments locally.
 */
export function getSecret(name: SecretName): string {
	const value = process.env[name]
	if (
		value &&
		name === 'STRIPE_SECRET_KEY' &&
		isLiveStripeKey(value) &&
		isRunningInEmulator()
	) {
		if (!warnedLiveStripeKey) {
			warnedLiveStripeKey = true
			logger.warn(
				'STRIPE_SECRET_KEY refused: a live Stripe key is never used under the emulator. Put a test-mode key in Functions/.secret.local.'
			)
		}
		return SECRET_PLACEHOLDERS[name]
	}
	if (value) {
		return value
	}
	if (!warnedMissingSecrets.has(name)) {
		warnedMissingSecrets.add(name)
		logger.warn(
			`${name} is required (set via Firebase secret or .secret.local)`
		)
	}
	return SECRET_PLACEHOLDERS[name]
}

export function getStripeSecretKey(): string {
	return getSecret('STRIPE_SECRET_KEY')
}

export function getStripeWebhookSecret(): string {
	return getSecret('STRIPE_WEBHOOK_SECRET')
}
