/**
 * The league's twelve-team schedule, as tables of numbered teams.
 *
 * A night has four rounds (6:00, 6:45, 7:30 and 8:15) of three games, one
 * per field. Every team plays twice a night, back to back: six teams play
 * rounds 1 and 2, the other six rounds 3 and 4.
 *
 * The regular-season tables follow the league's spreadsheet format and were
 * searched for so that, over the season, no two teams meet twice, every team
 * gets its share of early nights, home games and each field.
 * `templates.test.ts` pins every one of those properties.
 *
 * The playoff layout is the spreadsheet's, as Seasons 1 and 3 played it.
 */

/** [home, away], as team numbers 1–12. */
export type NumberedGame = readonly [number, number]

/** A round's three games, on fields 1, 2 and 3 in that order. */
export type NumberedRound = readonly [NumberedGame, NumberedGame, NumberedGame]

/** A night's four rounds, in kickoff order. */
export type NumberedNight = readonly [
	NumberedRound,
	NumberedRound,
	NumberedRound,
	NumberedRound,
]

export const SCHEDULE_TEAMS = 12

/** Rounds 1 and 2 are the early pair; 3 and 4 the late pair. */
export const ROUNDS_PER_NIGHT = 4

/**
 * Four regular-season nights: each team meets eight different opponents,
 * plays early on two nights and late on two, is home four times, and plays
 * two or three games on each field.
 */
const FOUR_NIGHTS: readonly NumberedNight[] = [
	[
		[
			[7, 8],
			[2, 3],
			[11, 10],
		],
		[
			[3, 10],
			[8, 11],
			[7, 2],
		],
		[
			[6, 5],
			[12, 4],
			[9, 1],
		],
		[
			[5, 9],
			[1, 12],
			[6, 4],
		],
	],
	[
		[
			[5, 11],
			[4, 9],
			[10, 12],
		],
		[
			[4, 10],
			[11, 9],
			[12, 5],
		],
		[
			[8, 1],
			[3, 7],
			[2, 6],
		],
		[
			[1, 2],
			[7, 6],
			[8, 3],
		],
	],
	[
		[
			[9, 6],
			[8, 2],
			[1, 4],
		],
		[
			[2, 4],
			[6, 1],
			[9, 8],
		],
		[
			[3, 12],
			[10, 5],
			[11, 7],
		],
		[
			[12, 11],
			[10, 7],
			[3, 5],
		],
	],
	[
		[
			[1, 3],
			[12, 6],
			[5, 7],
		],
		[
			[7, 12],
			[5, 1],
			[6, 3],
		],
		[
			[10, 8],
			[4, 11],
			[2, 9],
		],
		[
			[11, 2],
			[9, 10],
			[4, 8],
		],
	],
]

/**
 * Five regular-season nights: ten different opponents, early on two or
 * three nights, home five times, and three or four games on each field.
 */
const FIVE_NIGHTS: readonly NumberedNight[] = [
	[
		[
			[8, 4],
			[3, 9],
			[10, 5],
		],
		[
			[10, 3],
			[5, 8],
			[9, 4],
		],
		[
			[6, 7],
			[12, 11],
			[1, 2],
		],
		[
			[7, 1],
			[11, 2],
			[6, 12],
		],
	],
	[
		[
			[5, 2],
			[4, 6],
			[7, 11],
		],
		[
			[7, 2],
			[5, 6],
			[11, 4],
		],
		[
			[12, 9],
			[10, 1],
			[3, 8],
		],
		[
			[10, 12],
			[1, 3],
			[8, 9],
		],
	],
	[
		[
			[2, 6],
			[12, 3],
			[9, 5],
		],
		[
			[9, 6],
			[2, 12],
			[3, 5],
		],
		[
			[4, 1],
			[11, 8],
			[10, 7],
		],
		[
			[11, 10],
			[4, 7],
			[8, 1],
		],
	],
	[
		[
			[1, 9],
			[8, 10],
			[12, 7],
		],
		[
			[7, 8],
			[9, 10],
			[1, 12],
		],
		[
			[2, 3],
			[5, 4],
			[6, 11],
		],
		[
			[5, 11],
			[4, 2],
			[6, 3],
		],
	],
	[
		[
			[3, 11],
			[1, 6],
			[4, 10],
		],
		[
			[3, 4],
			[6, 10],
			[11, 1],
		],
		[
			[12, 5],
			[9, 7],
			[2, 8],
		],
		[
			[8, 12],
			[7, 5],
			[2, 9],
		],
	],
]

/** The regular season's tables, by how many regular-season nights it has. */
export const REGULAR_SEASON_TABLES: Readonly<
	Record<number, readonly NumberedNight[]>
> = {
	4: FOUR_NIGHTS,
	5: FIVE_NIGHTS,
}

/** The two playoff nights that follow the regular season. */
export const PLAYOFF_NIGHTS = 2

/**
 * Pool night's pools, by regular-season seed. Each pool plays a round robin,
 * three games, so every team plays twice.
 */
export const POOLS: readonly (readonly [number, number, number])[] = [
	[1, 8, 9],
	[2, 7, 10],
	[3, 6, 11],
	[4, 5, 12],
]

/** Pool night, as [home seed, away seed]: the spreadsheet's layout. */
export const POOL_NIGHT: NumberedNight = [
	[
		[1, 8],
		[3, 11],
		[2, 7],
	],
	[
		[8, 9],
		[4, 12],
		[6, 11],
	],
	[
		[1, 9],
		[5, 12],
		[7, 10],
	],
	[
		[3, 6],
		[4, 5],
		[2, 10],
	],
]

/**
 * Championship night. Field 1 decides places 1–4, field 2 places 5–8 and
 * field 3 places 9–12, from each pool's first, second and third team:
 *
 * - round 1: pool 1 against pool 4
 * - round 2: pool 2 against pool 3
 * - round 3: the two round-one and round-two losers, for third place
 * - round 4: the two winners, for first
 *
 * Indexes into `POOLS`, home first.
 */
export const CHAMPIONSHIP_POOL_GAMES: readonly (readonly [number, number])[] = [
	[0, 3],
	[1, 2],
]

/** Places on championship night's field: base + offset. */
export const PLACES_PER_FIELD = 4
