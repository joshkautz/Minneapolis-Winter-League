/**
 * Player name validation.
 *
 * `App/src/shared/utils/validation.ts` has the same rules as a Zod schema,
 * and that is the copy readers actually meet — it drives the inline errors on
 * the profile and sign-up forms. This one exists because the schema is not a
 * control: callables are invocable by any authenticated user, so a name that
 * never passes through the form can be anything at all. Names appear on
 * rosters, the schedule and the public rankings.
 *
 * The two are intentionally duplicated rather than shared, the same way
 * `types.ts` is: the workspaces build against different SDKs and neither
 * imports from the other. They must be changed together.
 *
 * One rule is deliberately missing here: the profanity filter, which needs the
 * `bad-words` package that only the App depends on. See docs/ROADMAP.md.
 */

import { HttpsError } from 'firebase-functions/v2/https'

/** Matches the App's `nameSchema` bounds. */
const MIN_LENGTH = 2
const MAX_LENGTH = 50

/** Letters, spaces, hyphens and apostrophes. */
const ALLOWED_CHARACTERS = /^[a-zA-Z\s'-]+$/

/** Doubled punctuation is malformed; doubled spaces are collapsed instead. */
const REPEATED_PUNCTUATION = /'{2,}|-{2,}/

/**
 * Validates and normalizes a player name, returning the value to store.
 *
 * Normalization matches the App's transform so a name written through a
 * callable reads the same as one typed into the form: whitespace runs
 * collapse to a single space and each word is capitalized.
 *
 * @param value - the raw name from the request
 * @param label - field name for the error message, e.g. 'First name'
 * @throws HttpsError('invalid-argument') when the name is not usable
 */
export function validateAndNormalizeName(
	value: unknown,
	label: string
): string {
	if (typeof value !== 'string') {
		throw new HttpsError(
			'invalid-argument',
			`${label} is required and must be a non-empty string`
		)
	}

	const trimmed = value.trim()

	if (trimmed.length < MIN_LENGTH) {
		throw new HttpsError(
			'invalid-argument',
			`${label} must be at least ${MIN_LENGTH} characters`
		)
	}

	if (trimmed.length > MAX_LENGTH) {
		throw new HttpsError(
			'invalid-argument',
			`${label} must be less than ${MAX_LENGTH} characters`
		)
	}

	if (!ALLOWED_CHARACTERS.test(trimmed)) {
		throw new HttpsError(
			'invalid-argument',
			`${label} can only contain letters, spaces, hyphens, and apostrophes`
		)
	}

	if (REPEATED_PUNCTUATION.test(trimmed)) {
		throw new HttpsError(
			'invalid-argument',
			`${label} cannot contain consecutive hyphens or apostrophes`
		)
	}

	return trimmed
		.replace(/\s+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase())
}
