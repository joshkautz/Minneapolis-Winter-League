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
 */

import { HttpsError } from 'firebase-functions/v2/https'
import { Filter } from 'bad-words'

/** Matches the App's `nameSchema` bounds. */
const MIN_LENGTH = 2
const MAX_LENGTH = 50

/** Letters, spaces, hyphens and apostrophes. */
const ALLOWED_CHARACTERS = /^[a-zA-Z\s'-]+$/

/**
 * Entries removed from the `bad-words` blocklist because they are real
 * people's names, and this filter is applied to names.
 *
 * Out of the box the list blocks Cox, Wang, Butt, Schaffer, Dick and Dyke,
 * among others — Cox is a top-1000 US surname and Wang is one of the most
 * common surnames in the world. Refusing them tells someone their legal name
 * is unacceptable, and a server-side rejection is the final word on it.
 *
 * The criterion for removal is: an established given name or surname whose
 * word is not primarily a slur against a group. Entries that are principally
 * slurs stay blocked even where they also occur as surnames, because the harm
 * of publishing one is higher and the collision is rarer.
 *
 * This is best-effort and cannot be complete — surnames are not enumerable.
 * The backstop is that admins bypass this check entirely (see
 * `checkProfanity`), so an organizer can always set a name the filter refuses.
 *
 * **Keep in sync with `App/src/shared/utils/validation.ts`.**
 */
const REAL_NAMES_WRONGLY_FLAGGED = [
	'butt',
	'cox',
	'dick',
	'dyke',
	'fanny',
	'fuk',
	'gaylord',
	'hoar',
	'hoare',
	'hore',
	'kuntz',
	'lipshits',
	'lipshitz',
	'muff',
	'pecker',
	'schaffer',
	'schmuck',
	'wang',
	'willies',
	'willy',
]

const profanityFilter = new Filter()
profanityFilter.removeWords(...REAL_NAMES_WRONGLY_FLAGGED)

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
	label: string,
	options: {
		/**
		 * Admin edits skip the profanity check. The filter cannot know every
		 * surname, so an organizer typing a name deliberately is the override
		 * for a real person it refuses — the same reasoning as an admin-set
		 * email counting as verified. The structural rules still apply.
		 */
		checkProfanity?: boolean
	} = {}
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

	if (options.checkProfanity !== false && profanityFilter.isProfane(trimmed)) {
		throw new HttpsError(
			'invalid-argument',
			`${label} contains inappropriate language. If this is your real name, please contact the league and an organizer will set it for you.`
		)
	}

	return trimmed
		.replace(/\s+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase())
}
