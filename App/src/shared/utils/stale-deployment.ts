/**
 * Detecting a stale deployment.
 *
 * Vite fingerprints every chunk, so a deploy replaces `schedule-CPyrQfwJ.js`
 * with a new filename and removes the old one. A tab that was loaded before
 * the deploy still holds the old entry chunk, which references filenames that
 * no longer exist — so the next lazily-loaded route fails to import.
 *
 * This is not an application fault and the only fix is to reload, which
 * fetches the current entry chunk. We reach it through the error boundary, so
 * we have to recognise it by its message; browsers each word it differently
 * and none of them expose a machine-readable code.
 */

/**
 * Messages the four engines produce when a dynamic import 404s, plus Vite's
 * own message for a stylesheet preload that fails the same way.
 *
 * Matched case-insensitively against the message, so a browser that adds
 * surrounding context still matches.
 */
const STALE_CHUNK_MESSAGES = [
	// Chrome, Edge, and other Chromium browsers
	'failed to fetch dynamically imported module',
	// Firefox
	'error loading dynamically imported module',
	// Safari
	'importing a module script failed',
	// Vite's preload helper, when a chunk's stylesheet is the missing file
	'unable to preload css',
	// Webpack-style name, kept because Vite's legacy plugin still throws it
	'chunkloaderror',
]

/**
 * True when this error means the tab is running against a deployment that no
 * longer exists, rather than something wrong with the app itself.
 */
export function isStaleDeploymentError(error: unknown): boolean {
	if (!error) {
		return false
	}

	const name = error instanceof Error ? error.name.toLowerCase() : ''
	if (name === 'chunkloaderror') {
		return true
	}

	const message = (
		error instanceof Error ? error.message : String(error)
	).toLowerCase()

	return STALE_CHUNK_MESSAGES.some((candidate) => message.includes(candidate))
}
