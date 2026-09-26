/**
 * Player and team name validation.
 *
 * The rules themselves live in `nameRules.ts`, which the App imports so its
 * forms say the same thing. This is the copy that counts: callables are
 * invocable by any authenticated user, so a name that never passes through a
 * form can be anything at all, and names appear on rosters, the schedule and
 * the public rankings.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import { Filter } from 'bad-words'
import {
	PLAYER_NAME_CHARACTERS,
	REAL_NAMES_WRONGLY_FLAGGED,
	REPEATED_PUNCTUATION,
	formatPlayerName,
	nameLengthProblem,
	normalizeTypography,
} from './nameRules.js'

const profanityFilter = new Filter()
profanityFilter.removeWords(...REAL_NAMES_WRONGLY_FLAGGED)

interface NameOptions {
	/**
	 * Admin edits skip the profanity check. The filter cannot know every
	 * surname, so an organizer typing a name deliberately is the override
	 * for a real person it refuses — the same reasoning as an admin-set
	 * email counting as verified. The structural rules still apply.
	 */
	checkProfanity?: boolean
}

const invalid = (message: string): HttpsError =>
	new HttpsError('invalid-argument', message)

const requireString = (value: unknown, label: string): string => {
	if (typeof value !== 'string' || value.trim() === '') {
		throw invalid(`${label} is required.`)
	}
	return value.trim()
}

const refuseProfanity = (
	name: string,
	label: string,
	options: NameOptions,
	advice: string
): void => {
	if (options.checkProfanity !== false && profanityFilter.isProfane(name)) {
		throw invalid(`${label} contains inappropriate language. ${advice}`)
	}
}

/**
 * Validates and normalizes a player name, returning the value to store.
 *
 * Normalization matches the App's so a name written through a callable reads
 * the same as one typed into the form: whitespace runs collapse to a single
 * space and each word is capitalized.
 *
 * @param value - the raw name from the request
 * @param label - field name for the error message, e.g. 'First name'
 * @throws HttpsError('invalid-argument') when the name is not usable
 */
export function validateAndNormalizeName(
	value: unknown,
	label: string,
	options: NameOptions = {}
): string {
	const name = normalizeTypography(requireString(value, label))

	const lengthProblem = nameLengthProblem(name, label)
	if (lengthProblem) throw invalid(lengthProblem)

	if (!PLAYER_NAME_CHARACTERS.test(name)) {
		throw invalid(
			`${label} can only contain letters, spaces, hyphens, and apostrophes`
		)
	}
	if (REPEATED_PUNCTUATION.test(name)) {
		throw invalid(`${label} cannot contain consecutive hyphens or apostrophes`)
	}
	refuseProfanity(
		name,
		label,
		options,
		'If this is your real name, please contact the league and an organizer will set it for you.'
	)

	return formatPlayerName(name)
}

/**
 * Validates a team name, returning it trimmed. Team names may hold any
 * characters — numbers, punctuation, emoji — so only length and language
 * are checked.
 *
 * @throws HttpsError('invalid-argument') when the name is not usable
 */
export function validateTeamName(
	value: unknown,
	options: NameOptions = {}
): string {
	const label = 'Team name'
	const name = requireString(value, label)

	const lengthProblem = nameLengthProblem(name, label)
	if (lengthProblem) throw invalid(lengthProblem)

	refuseProfanity(name, label, options, 'Please choose a different name.')
	return name
}
