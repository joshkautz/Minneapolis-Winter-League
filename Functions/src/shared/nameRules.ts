/**
 * What a player's or team's name may be.
 *
 * The App imports this file (`App/src/shared/name-rules.ts`) so a form
 * refuses a name in the server's own words, before it is sent. Keep it free
 * of imports, as the image and text rules are: it is loaded from the other
 * workspace. The profanity filter itself is a dependency, so each side builds
 * its own from `REAL_NAMES_WRONGLY_FLAGGED`.
 */

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 50

/** Letters from any script, plus spaces, hyphens and apostrophes. */
export const PLAYER_NAME_CHARACTERS = /^[\p{L}\p{M}\s'-]+$/u

/** Doubled punctuation is malformed; doubled spaces are collapsed instead. */
export const REPEATED_PUNCTUATION = /'{2,}|-{2,}/

/**
 * Typographic characters that mean the same thing as their ASCII
 * counterparts, normalized before validating.
 *
 * iOS and macOS substitute a curly apostrophe (U+2019) as you type, so
 * "O'Dowd" typed on a phone arrives as "O’Dowd". Rejecting that tells
 * someone their own name is invalid for a reason they cannot see. Two players
 * in this league are already stored with one.
 */
const TYPOGRAPHIC_REPLACEMENTS: [RegExp, string][] = [
	[/[‘’ʼ՚]/g, "'"],
	[/[‐‑‒–—−]/g, '-'],
]

export const normalizeTypography = (name: string): string =>
	TYPOGRAPHIC_REPLACEMENTS.reduce(
		(text, [pattern, replacement]) => text.replace(pattern, replacement),
		name
	)

/**
 * Collapses runs of whitespace and capitalizes each word, so a name reads
 * the same however it was typed. `\b\w` would only reach ASCII, leaving
 * "josé" as "José" but "ñoño" untouched.
 */
export const formatPlayerName = (name: string): string =>
	name
		.replace(/\s+/g, ' ')
		.replace(
			/(^|[\s'-])(\p{L})/gu,
			(_match, boundary: string, letter: string) =>
				boundary + letter.toUpperCase()
		)

/** The length problem with a name, or null when it is long enough and short enough. */
export const nameLengthProblem = (
	name: string,
	label: string
): string | null => {
	if (name.length < NAME_MIN_LENGTH) {
		return `${label} must be at least ${NAME_MIN_LENGTH} characters`
	}
	if (name.length > NAME_MAX_LENGTH) {
		return `${label} must be at most ${NAME_MAX_LENGTH} characters`
	}
	return null
}

/**
 * Entries removed from the `bad-words` blocklist because they are real
 * people's names, and the filter is applied to names.
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
 * The backstop is that admins bypass the check entirely, so an organizer can
 * always set a name the filter refuses.
 */
export const REAL_NAMES_WRONGLY_FLAGGED = [
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
