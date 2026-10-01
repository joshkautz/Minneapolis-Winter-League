/**
 * Every badge a team can earn. Badges are awarded only by the rules in
 * `services/badges/rules.ts`, one per id here; nobody awards one by hand.
 *
 * The App imports this file (`App/src/shared/badges.ts`) to show each badge's
 * name and description, and `scripts/badge-art/` draws the artwork for each
 * id, served from `App/public/badges/<id>.webp`. Keep it free of imports: it
 * is loaded from the other workspace and by the art script.
 */

/** How rare a badge is, which sets the colour of its rim. */
export type BadgeTier = 'common' | 'uncommon' | 'rare' | 'fall'

export interface BadgeDefinition {
	id: string
	name: string
	/** What earns it, as the team page shows it. */
	description: string
	tier: BadgeTier
	/**
	 * Earned at most once per team, ever, rather than once per season: a
	 * milestone such as a second title or a fifth season.
	 */
	once?: true
}

/** Merciless's margin of victory. */
export const MERCILESS_MARGIN = 15
/** Speedrunners' total points in one game. */
export const SPEEDRUNNERS_TOTAL = 27
/** Show Off's points for one team in one game. */
export const SHOW_OFF_POINTS = 18
/** Just Warming Up's points for one team in one game. */
export const WARMING_UP_POINTS = 5
/** Frozen Out's most points an opponent may score. */
export const FROZEN_OUT_POINTS = 3
/** Bounce Back's margin of the loss bounced back from. */
export const BOUNCE_BACK_LOSS_MARGIN = 8
/** Hot Streak's wins in a row. */
export const HOT_STREAK_WINS = 5
/** The fewest regular-season games for a Perfect Season. */
export const PERFECT_SEASON_MIN_GAMES = 4
/** Fresh Faces' players new to the league. */
export const FRESH_FACES_PLAYERS = 10
/** Reunion Tour's players who were teammates elsewhere last season. */
export const REUNION_TOUR_PLAYERS = 5
/** Old Guard's season. */
export const OLD_GUARD_SEASON = 5
/** Dynasty's championships. */
export const DYNASTY_TITLES = 2

export const BADGES: readonly BadgeDefinition[] = [
	// ---- Rare ---------------------------------------------------------------
	{
		id: 'champions',
		name: 'Champions',
		description: 'Win the season championship.',
		tier: 'rare',
	},
	{
		id: 'runner-up',
		name: 'Runner-up',
		description: 'Finish second in the season.',
		tier: 'rare',
	},
	{
		id: 'dynasty',
		name: 'Dynasty',
		description: `Win ${DYNASTY_TITLES} championships.`,
		tier: 'rare',
		once: true,
	},
	{
		id: 'perfect-season',
		name: 'Perfect Season',
		description: 'Win every game of the regular season.',
		tier: 'rare',
	},
	{
		id: 'bagel',
		name: 'Bagel',
		description: 'Win a game without the other team scoring.',
		tier: 'rare',
	},
	{
		id: 'early-bird',
		name: 'Early Bird',
		description: 'Be the first team to fully register for the season.',
		tier: 'rare',
	},
	{
		id: 'close-call',
		name: 'Close Call',
		description: 'Be the last team to fully register, taking the final spot.',
		tier: 'rare',
	},
	{
		id: 'celebrity',
		name: 'Celebrity',
		description:
			"Have the season's top-rated player on your roster when it begins.",
		tier: 'rare',
	},
	{
		id: 'rising-stars',
		name: 'Rising Stars',
		description: "Your players' ratings rose the most over the season.",
		tier: 'rare',
	},

	// ---- Uncommon -----------------------------------------------------------
	{
		id: 'podium',
		name: 'Podium',
		description: 'Finish in the top three.',
		tier: 'uncommon',
	},
	{
		id: 'giant-slayer',
		name: 'Giant Slayer',
		description: 'Beat the team leading the standings.',
		tier: 'uncommon',
	},
	{
		id: 'merciless',
		name: 'Merciless',
		description: `Win a game by ${MERCILESS_MARGIN} or more.`,
		tier: 'uncommon',
	},
	{
		id: 'bounce-back',
		name: 'Bounce Back',
		description: `Win right after losing by ${BOUNCE_BACK_LOSS_MARGIN} or more.`,
		tier: 'uncommon',
	},
	{
		id: 'frozen-out',
		name: 'Frozen Out',
		description: `Win a game holding the other team to ${FROZEN_OUT_POINTS} or fewer.`,
		tier: 'uncommon',
	},
	{
		id: 'hot-streak',
		name: 'Hot Streak',
		description: `Win ${HOT_STREAK_WINS} games in a row.`,
		tier: 'uncommon',
	},
	{
		id: 'show-off',
		name: 'Show Off',
		description: `Score ${SHOW_OFF_POINTS} or more in a game.`,
		tier: 'uncommon',
	},
	{
		id: 'speedrunners',
		name: 'Speedrunners',
		description: `Play a game with ${SPEEDRUNNERS_TOTAL} or more points scored.`,
		tier: 'uncommon',
	},
	{
		id: 'fresh-faces',
		name: 'Fresh Faces',
		description: `Start the season with ${FRESH_FACES_PLAYERS} or more players new to the league.`,
		tier: 'uncommon',
	},
	{
		id: 'reunion-tour',
		name: 'Reunion Tour',
		description: `Start the season with ${REUNION_TOUR_PLAYERS} or more players who were teammates on another team last season.`,
		tier: 'uncommon',
	},
	{
		id: 'old-guard',
		name: 'Old Guard',
		description: `Play your ${OLD_GUARD_SEASON}th season.`,
		tier: 'uncommon',
		once: true,
	},

	// ---- Common -------------------------------------------------------------
	{
		id: 'universe-point',
		name: 'Universe Point',
		description: 'Win a game by exactly one point.',
		tier: 'common',
	},
	{
		id: 'just-warming-up',
		name: 'Just Warming Up',
		description: `Score ${WARMING_UP_POINTS} or fewer in a game.`,
		tier: 'common',
	},
	{
		id: 'welcome',
		name: 'Welcome',
		description: 'Start the season as a new team.',
		tier: 'common',
	},
	{
		id: 'veteran',
		name: 'Veteran',
		description: 'Start the season as a rolled-over team.',
		tier: 'common',
	},

	// ---- Fall ---------------------------------------------------------------
	{
		id: 'turkey-bowl',
		name: 'Turkey Bowl',
		description: 'Win your first game back after the Thanksgiving break.',
		tier: 'fall',
	},
	{
		id: 'opening-night',
		name: 'Opening Night',
		description: 'Win your first game of the season.',
		tier: 'fall',
	},
	{
		id: 'last-dance',
		name: 'Last Dance',
		description: 'Win every game on the final night of the regular season.',
		tier: 'fall',
	},
]

/** The award document id for a badge earned in a season. */
export const awardId = (badgeId: string, seasonId: string): string =>
	`${badgeId}_${seasonId}`
