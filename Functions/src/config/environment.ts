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
 * from `Functions/.secret.local`.
 */
export function getSecret(name: SecretName): string {
	const value = process.env[name]
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
