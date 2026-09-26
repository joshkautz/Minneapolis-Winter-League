/**
 * Checking written text on the server, against the rules in `textRules.ts`.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import { textProblem, type TextRule } from './textRules.js'

export { TEXT_RULES } from './textRules.js'

/**
 * The trimmed text, or `invalid-argument` saying why it cannot be used:
 * missing, too short or too long.
 */
export function requireText(value: unknown, rule: TextRule): string {
	const problem = textProblem(value, rule)
	if (problem) throw new HttpsError('invalid-argument', problem)
	return (value as string).trim()
}
