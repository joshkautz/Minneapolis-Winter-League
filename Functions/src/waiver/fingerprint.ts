/**
 * The fingerprint a signature records of the text it agreed to.
 *
 * Kept apart from `versions.ts` and `rules.ts` because it needs Node's crypto,
 * and those two must stay importable by the App.
 */

import { createHash } from 'node:crypto'
import type { WaiverVersion } from './versions.js'

/**
 * SHA-256 of a version, over its JSON form. Key order is the order the
 * version is written in, which is stable, so the same text always gives the
 * same hash.
 */
export const waiverFingerprint = (version: WaiverVersion): string =>
	createHash('sha256').update(JSON.stringify(version)).digest('hex')
