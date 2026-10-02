/**
 * When and where the league plays: four kickoffs on a Saturday evening, on
 * three fields. The App imports this file for its game form, so it must
 * stay free of imports.
 */

/**
 * The league plays in Minneapolis: its nights, kickoffs and the dates shown
 * to players are on this clock, whatever the reader's own.
 */
export const LEAGUE_TIME_ZONE = 'America/Chicago'

/** Kickoffs on Minneapolis's clock, in order: a night's rounds. */
export const GAME_TIME_SLOTS = ['18:00', '18:45', '19:30', '20:15'] as const

/** The fields, numbered as the venue numbers them. */
export const GAME_FIELDS = [1, 2, 3] as const

/** "6:45pm", from "18:45". */
export const gameTimeLabel = (slot: string): string => {
	const [hours, minutes] = slot.split(':').map(Number)
	const suffix = hours >= 12 ? 'pm' : 'am'
	return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${suffix}`
}

/** "6:00pm, 6:45pm, 7:30pm, or 8:15pm": every kickoff, for messages. */
export const GAME_TIMES_IN_WORDS = GAME_TIME_SLOTS.map(gameTimeLabel)
	.map((label, index, all) =>
		index === all.length - 1 && all.length > 1 ? `or ${label}` : label
	)
	.join(', ')
