/**
 * Turning an error into a sentence a player can act on.
 *
 * Errors reach the App from three places, and none of them is written for a
 * reader: Firebase Auth ("Firebase: Error (auth/invalid-credential)."),
 * Firestore ("Missing or insufficient permissions.") and the network
 * ("Failed to fetch"). The callables are different: every refusal they send
 * is an `HttpsError` whose message is already meant for the user, so that is
 * shown as it is. Everything else is translated here, or replaced by the
 * caller's fallback, which should say what failed ("Your team could not be
 * created.").
 */

/** Where to turn when nothing on the page can fix it. */
export const LEAGUE_CONTACT = 'leadership@mplsmallard.com'

const NETWORK =
	'We could not reach the server. Check your internet connection and try again.'

const TIMEOUT =
	'The server took too long to answer. Check whether your change went ' +
	'through before trying again.'

const WRONG_CREDENTIALS =
	'That email and password do not match an account. Check them and try again.'

/** Firebase Auth codes, as the Auth SDK reports them. */
const AUTH_MESSAGES: Record<string, string> = {
	'auth/invalid-credential': WRONG_CREDENTIALS,
	'auth/wrong-password': WRONG_CREDENTIALS,
	'auth/user-not-found': WRONG_CREDENTIALS,
	'auth/invalid-email': 'Enter a valid email address.',
	'auth/missing-email': 'Enter your email address.',
	'auth/missing-password': 'Enter your password.',
	'auth/email-already-in-use':
		'An account with this email already exists. Sign in instead, or reset your password.',
	'auth/weak-password':
		'That password is too weak. Choose a longer one with a mix of characters.',
	'auth/too-many-requests':
		'Too many attempts in a short time. Wait a few minutes, then try again.',
	'auth/user-disabled': `This account has been disabled. Contact ${LEAGUE_CONTACT}.`,
	'auth/requires-recent-login':
		'For your security, sign out and back in, then try again.',
	'auth/user-token-expired': 'Your session has ended. Sign in again.',
	'auth/expired-action-code':
		'This link has expired. Request a new one and use it straight away.',
	'auth/invalid-action-code':
		'This link has already been used or is not valid. Request a new one.',
	'auth/network-request-failed': NETWORK,
}

/** Firestore codes, and callable codes that mean the same thing. */
const TRANSPORT_MESSAGES: Record<string, string> = {
	unavailable: NETWORK,
	'deadline-exceeded': TIMEOUT,
	'resource-exhausted':
		'Too many requests right now. Wait a moment, then try again.',
	'permission-denied': 'You do not have access to this.',
	unauthenticated: 'Sign in to continue.',
}

/** Messages that say nothing: the SDK's own words for "no message". */
const EMPTY_MESSAGES = new Set(['', 'internal', 'unknown', 'error'])

/** Text that is plainly meant for a developer, not a player. */
const TECHNICAL = [
	/^Firebase:/,
	/\((auth|firestore|functions|storage)\//,
	/\b(TypeError|ReferenceError|SyntaxError|undefined|null|NaN)\b/,
	/\bat \S+:\d+/,
	/^[A-Z_]+$/,
]

/** The error's Firebase code, as given: "functions/not-found", "auth/…". */
const fullCode = (error: unknown): string | undefined => {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return undefined
	}
	const { code } = error as { code: unknown }
	return typeof code === 'string' ? code : undefined
}

/** The error's code without the callable prefix: "not-found". */
export const errorCode = (error: unknown): string | undefined =>
	fullCode(error)?.replace(/^functions\//, '')

const rawMessage = (error: unknown): string => {
	if (typeof error === 'string') return error.trim()
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const { message } = error as { message: unknown }
		if (typeof message === 'string') return message.trim()
	}
	return ''
}

const isNetworkFailure = (error: unknown): boolean =>
	error instanceof TypeError && /fetch|network|load failed/i.test(error.message)

/**
 * A sentence to show for `error`. `fallback` is used when the error carries
 * nothing a player could understand, so make it say what failed.
 */
export const errorMessage = (error: unknown, fallback: string): string => {
	if (isNetworkFailure(error)) return NETWORK

	const code = fullCode(error)
	const message = rawMessage(error)
	const readable =
		!EMPTY_MESSAGES.has(message.toLowerCase()) &&
		message.toLowerCase() !== errorCode(error) &&
		!TECHNICAL.some((pattern) => pattern.test(message))

	// Auth's own messages are never fit to show.
	if (code?.startsWith('auth/')) return AUTH_MESSAGES[code] ?? fallback

	// A callable's refusal is written for the user, so it is shown as sent;
	// without one, the code still says what kind of failure it was.
	if (code?.startsWith('functions/')) {
		if (readable) return message
		return TRANSPORT_MESSAGES[code.slice('functions/'.length)] ?? fallback
	}

	// Firestore and Storage: the code is meaningful, the message is not.
	if (code) return TRANSPORT_MESSAGES[code] ?? fallback

	// An Error thrown by the App itself says what went wrong.
	return readable ? message : fallback
}
