/**
 * Validation for the URLs Stripe Checkout sends a payer back to.
 *
 * The client supplies `success_url` and `cancel_url`, and Stripe redirects to
 * whatever it is given. Passing them through unchecked makes the checkout an
 * open redirect: a link to a genuine Stripe payment page that lands the payer
 * on a site of an attacker's choosing, at the moment they are most inclined
 * to trust what they see next.
 *
 * Only the league's own origins are accepted.
 */

import { FIREBASE_CONFIG } from '../config/constants.js'
import { isRunningInEmulator } from '../config/environment.js'

const PROJECT_ID = 'minnesota-winter-league'

/** Origins the production site is served from. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
	...FIREBASE_CONFIG.CORS_ORIGINS,
	`https://${PROJECT_ID}.web.app`,
	`https://${PROJECT_ID}.firebaseapp.com`,
])

/**
 * Pull-request preview channels, e.g. `minnesota-winter-league--pr1234-ab12cd.web.app`.
 * Only this project can deploy to them, and they call the production
 * Functions, so a checkout started from one has to be able to return to it.
 */
const PREVIEW_CHANNEL_HOST = new RegExp(
	`^${PROJECT_ID}--[a-z0-9-]+\\.web\\.app$`
)

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1'])

/**
 * Whether a URL may be used as a Checkout return URL.
 *
 * Local development origins are accepted only under the Functions emulator,
 * which sets `FUNCTIONS_EMULATOR`; a deployed function never sees it.
 */
export function isAllowedReturnUrl(
	value: unknown,
	options: { allowLocal?: boolean } = {}
): boolean {
	if (typeof value !== 'string' || value.length === 0) return false

	let url: URL
	try {
		url = new URL(value)
	} catch {
		return false
	}

	// Credentials in the authority are a classic way of disguising where a
	// link really goes (`https://mplswinterleague.com@evil.example`). URL
	// parsing already puts that host in the right place, but there is no
	// legitimate reason for a return URL to carry them.
	if (url.username !== '' || url.password !== '') return false

	const allowLocal = options.allowLocal ?? isRunningInEmulator()
	if (
		allowLocal &&
		url.protocol === 'http:' &&
		LOCAL_HOSTNAMES.has(url.hostname)
	) {
		return true
	}

	if (url.protocol !== 'https:') return false

	return (
		ALLOWED_ORIGINS.has(url.origin) ||
		(url.port === '' && PREVIEW_CHANNEL_HOST.test(url.hostname))
	)
}
