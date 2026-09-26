/**
 * What a player's or team's name may be, imported from
 * `Functions/src/shared/nameRules.ts` so a form refuses a name in the
 * server's own words. That file has no imports, which is what makes loading
 * it from the other workspace safe.
 */

export {
	NAME_MAX_LENGTH,
	NAME_MIN_LENGTH,
	PLAYER_NAME_CHARACTERS,
	REAL_NAMES_WRONGLY_FLAGGED,
	REPEATED_PUNCTUATION,
	formatPlayerName,
	normalizeTypography,
} from '../../../Functions/src/shared/nameRules'
