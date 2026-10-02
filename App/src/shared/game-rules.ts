/**
 * When and where the league plays — the kickoffs and fields a game may be
 * given — imported from `Functions/src/shared/gameRules.ts`, so the game
 * form offers exactly what the server accepts. That file has no imports,
 * which is what makes loading it from the other workspace safe.
 */

export {
	GAME_FIELDS,
	GAME_TIME_SLOTS,
	gameTimeLabel,
} from '../../../Functions/src/shared/gameRules'
