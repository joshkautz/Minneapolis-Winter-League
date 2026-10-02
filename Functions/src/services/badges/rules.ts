/**
 * The rules that award every badge, as pure functions of the league's data.
 *
 * `awardsFor(facts)` returns every award every team has earned in every
 * season. The rebuild writes exactly that set, so an award is a projection of
 * the games, rosters, registrations and ratings: correct a score and a badge
 * it no longer supports goes away. Each rule awards a team at most once a
 * season, for the first time it qualified, with a sentence saying how.
 *
 * Forfeited games are not in `facts.games`: no badge is won or lost by a
 * team that did not play.
 */

import {
	BOUNCE_BACK_LOSS_MARGIN,
	DYNASTY_TITLES,
	FRESH_FACES_PLAYERS,
	FROZEN_OUT_POINTS,
	HOT_STREAK_WINS,
	MERCILESS_MARGIN,
	OLD_GUARD_SEASON,
	PERFECT_SEASON_MIN_GAMES,
	REUNION_TOUR_PLAYERS,
	SHOW_OFF_POINTS,
	SPEEDRUNNERS_TOTAL,
	WARMING_UP_POINTS,
} from '../../badges/catalog.js'
import { REGISTRATION_SPOTS } from '../../shared/teamPaymentRules.js'
import {
	leagueDayKey,
	leagueMonthDay,
	thanksgivingSaturday,
} from '../../shared/leagueCalendar.js'

export interface BadgeSeason {
	id: string
	name: string
	dateStart: Date
	dateEnd: Date
	registrationEnd: Date
}

export interface BadgeTeamSeason {
	teamId: string
	seasonId: string
	name: string
	registered: boolean
	registeredDate: Date | null
	placement: number | null
	/** Player ids on the roster. */
	roster: string[]
}

/** A played game: both teams set, both scores recorded, not forfeited. */
export interface BadgeGame {
	id: string
	seasonId: string
	date: Date
	type: 'regular' | 'playoff'
	homeTeamId: string
	awayTeamId: string
	homeScore: number
	awayScore: number
}

export interface BadgeFacts {
	now: Date
	/** Every season, oldest first. */
	seasons: BadgeSeason[]
	teamSeasons: BadgeTeamSeason[]
	/** Every played game, earliest first. */
	games: BadgeGame[]
	/** A player's all-time rating as it stood just before `date`, if rated. */
	ratingBefore: (playerId: string, date: Date) => number | null
	/** Season id → player id → rating change over that season. */
	seasonRatingChanges: ReadonlyMap<string, ReadonlyMap<string, number>>
	playerNames: ReadonlyMap<string, string>
}

export interface Award {
	badgeId: string
	teamId: string
	seasonId: string
	earnedAt: Date
	reason: string
}

/** One team's side of one game. */
interface Result {
	game: BadgeGame
	teamId: string
	opponentId: string
	scored: number
	allowed: number
	won: boolean
	lost: boolean
	night: string
}

/** Everything a rule needs about one season. */
interface SeasonView {
	facts: BadgeFacts
	season: BadgeSeason
	/** This season's team-seasons, by team id. */
	teams: Map<string, BadgeTeamSeason>
	/** Each team's results, earliest first. */
	results: Map<string, Result[]>
	/** Every result this season, earliest first. */
	allResults: Result[]
	/** Team-seasons in earlier seasons, by team id, oldest first. */
	earlierSeasons: Map<string, BadgeTeamSeason[]>
	/** The season before this one, if any. */
	previous: BadgeSeason | undefined
	teamName: (teamId: string) => string
}

type Rule = (view: SeasonView) => Award[]

const ORDINALS = ['first', 'second', 'third']

const scoreline = (result: Result): string =>
	`${result.scored}–${result.allowed}`

/**
 * Ends a reason with a full stop, unless it already ends with one: a team
 * named "Seatbelt Inspection CO." must not end up "CO..".
 */
const sentence = (text: string): string =>
	/[.!?]$/.test(text) ? text : `${text}.`

/** The award for the first result that satisfies `test`, if any. */
const firstResult =
	(
		badgeId: string,
		test: (result: Result, view: SeasonView) => boolean,
		reason: (result: Result, view: SeasonView) => string
	): Rule =>
	(view) => {
		const awards: Award[] = []
		for (const [teamId, results] of view.results) {
			const hit = results.find((result) => test(result, view))
			if (hit) {
				awards.push({
					badgeId,
					teamId,
					seasonId: view.season.id,
					earnedAt: hit.game.date,
					reason: sentence(reason(hit, view)),
				})
			}
		}
		return awards
	}

const award = (
	view: SeasonView,
	badgeId: string,
	teamId: string,
	earnedAt: Date,
	reason: string
): Award => ({
	badgeId,
	teamId,
	seasonId: view.season.id,
	earnedAt,
	reason: sentence(reason),
})

const beat = (result: Result, view: SeasonView): string =>
	`Beat ${view.teamName(result.opponentId)} ${scoreline(result)} on ${leagueMonthDay(result.game.date)}`

const seasonStarted = (view: SeasonView): boolean =>
	view.facts.now >= view.season.dateStart

const seasonOver = (view: SeasonView): boolean =>
	view.facts.now >= view.season.dateEnd

/** The regular season is over once playoffs begin or the season ends. */
const regularSeasonOver = (view: SeasonView): boolean =>
	seasonOver(view) || view.allResults.some((r) => r.game.type === 'playoff')

/** Registration is over once it closes or every spot is taken. */
const registrationOver = (view: SeasonView): boolean =>
	view.facts.now >= view.season.registrationEnd ||
	[...view.teams.values()].filter((team) => team.registered).length >=
		REGISTRATION_SPOTS

const registeredTeams = (view: SeasonView): BadgeTeamSeason[] =>
	[...view.teams.values()].filter((team) => team.registered)

/** How many earlier seasons a team registered for. */
const seasonsRegisteredBefore = (view: SeasonView, teamId: string): number =>
	(view.earlierSeasons.get(teamId) ?? []).filter(
		(earlier) => earlier.registered
	).length

// ---- Game badges ------------------------------------------------------------

const universePoint = firstResult(
	'universe-point',
	(r) => r.won && r.scored - r.allowed === 1,
	beat
)

const bagel = firstResult('bagel', (r) => r.won && r.allowed === 0, beat)

const frozenOut = firstResult(
	'frozen-out',
	(r) => r.won && r.allowed <= FROZEN_OUT_POINTS,
	beat
)

const merciless = firstResult(
	'merciless',
	(r) => r.won && r.scored - r.allowed >= MERCILESS_MARGIN,
	beat
)

const showOff = firstResult(
	'show-off',
	(r) => r.scored >= SHOW_OFF_POINTS,
	(r, view) =>
		`Scored ${r.scored} against ${view.teamName(r.opponentId)} on ${leagueMonthDay(r.game.date)}.`
)

const justWarmingUp = firstResult(
	'just-warming-up',
	(r) => r.scored <= WARMING_UP_POINTS,
	(r, view) =>
		`Scored ${r.scored} against ${view.teamName(r.opponentId)} on ${leagueMonthDay(r.game.date)}.`
)

const speedrunners = firstResult(
	'speedrunners',
	(r) => r.scored + r.allowed >= SPEEDRUNNERS_TOTAL,
	(r, view) =>
		`Played ${view.teamName(r.opponentId)} ${scoreline(r)} on ${leagueMonthDay(r.game.date)}.`
)

const bounceBack: Rule = (view) => {
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		for (let i = 1; i < results.length; i++) {
			const before = results[i - 1]
			const after = results[i]
			if (
				before.lost &&
				before.allowed - before.scored >= BOUNCE_BACK_LOSS_MARGIN &&
				after.won
			) {
				awards.push(
					award(
						view,
						'bounce-back',
						teamId,
						after.game.date,
						`Beat ${view.teamName(after.opponentId)} after losing ${scoreline(before)} to ${view.teamName(before.opponentId)}`
					)
				)
				break
			}
		}
	}
	return awards
}

const hotStreak: Rule = (view) => {
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		let run = 0
		for (const result of results) {
			run = result.won ? run + 1 : 0
			if (run === HOT_STREAK_WINS) {
				awards.push(
					award(
						view,
						'hot-streak',
						teamId,
						result.game.date,
						`Won ${HOT_STREAK_WINS} in a row, through ${leagueMonthDay(result.game.date)}.`
					)
				)
				break
			}
		}
	}
	return awards
}

/**
 * Beat a team that, going into that night, had the most wins of the season
 * (and was not tied for it with the winner).
 */
const giantSlayer: Rule = (view) => {
	const wins = new Map<string, number>()
	const awarded = new Set<string>()
	const awards: Award[] = []
	const nights = [...new Set(view.allResults.map((r) => r.night))].sort()
	for (const night of nights) {
		const most = Math.max(0, ...wins.values())
		const leaders = new Set(
			[...wins].filter(([, w]) => most > 0 && w === most).map(([t]) => t)
		)
		const tonight = view.allResults.filter((r) => r.night === night)
		for (const result of tonight) {
			if (
				result.won &&
				leaders.has(result.opponentId) &&
				!leaders.has(result.teamId) &&
				!awarded.has(result.teamId)
			) {
				awarded.add(result.teamId)
				awards.push(
					award(
						view,
						'giant-slayer',
						result.teamId,
						result.game.date,
						`Beat standings leader ${view.teamName(result.opponentId)} ${scoreline(result)} on ${leagueMonthDay(result.game.date)}`
					)
				)
			}
		}
		for (const result of tonight) {
			if (result.won)
				wins.set(result.teamId, (wins.get(result.teamId) ?? 0) + 1)
		}
	}
	return awards
}

const openingNight: Rule = (view) => {
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		const first = results[0]
		if (first?.won) {
			awards.push(
				award(view, 'opening-night', teamId, first.game.date, beat(first, view))
			)
		}
	}
	return awards
}

/** Won its first game on the first night after the Thanksgiving break. */
const turkeyBowl: Rule = (view) => {
	const year = view.season.dateStart.getUTCFullYear()
	const breakNight = thanksgivingSaturday(year).toISOString().slice(0, 10)
	if (
		breakNight < leagueDayKey(view.season.dateStart) ||
		breakNight > leagueDayKey(view.season.dateEnd)
	) {
		return []
	}
	const firstNightBack = [...new Set(view.allResults.map((r) => r.night))]
		.sort()
		.find((night) => night > breakNight)
	if (!firstNightBack) return []
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		const first = results.find((r) => r.night === firstNightBack)
		if (first?.won) {
			awards.push(
				award(view, 'turkey-bowl', teamId, first.game.date, beat(first, view))
			)
		}
	}
	return awards
}

/** Won every game on the last night of the regular season. */
const lastDance: Rule = (view) => {
	if (!regularSeasonOver(view)) return []
	const regularNights = view.allResults
		.filter((r) => r.game.type === 'regular')
		.map((r) => r.night)
	if (regularNights.length === 0) return []
	const lastNight = regularNights.sort().at(-1)
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		const tonight = results.filter(
			(r) => r.night === lastNight && r.game.type === 'regular'
		)
		if (tonight.length > 0 && tonight.every((r) => r.won)) {
			awards.push(
				award(
					view,
					'last-dance',
					teamId,
					tonight[tonight.length - 1].game.date,
					`Won ${tonight.length === 1 ? 'its game' : tonight.length === 2 ? 'both games' : `all ${tonight.length} games`} on the last night of the regular season, ${leagueMonthDay(tonight[0].game.date)}.`
				)
			)
		}
	}
	return awards
}

const perfectSeason: Rule = (view) => {
	if (!regularSeasonOver(view)) return []
	const awards: Award[] = []
	for (const [teamId, results] of view.results) {
		const regular = results.filter((r) => r.game.type === 'regular')
		if (
			regular.length >= PERFECT_SEASON_MIN_GAMES &&
			regular.every((r) => r.won)
		) {
			awards.push(
				award(
					view,
					'perfect-season',
					teamId,
					regular[regular.length - 1].game.date,
					`Went ${regular.length}–0 in the ${view.season.name} regular season.`
				)
			)
		}
	}
	return awards
}

// ---- Standings badges -------------------------------------------------------

const placed =
	(badgeId: string, test: (placement: number) => boolean): Rule =>
	(view) =>
		[...view.teams.values()]
			.filter((team) => team.placement !== null && test(team.placement))
			.map((team) =>
				award(
					view,
					badgeId,
					team.teamId,
					view.season.dateEnd,
					team.placement === 1
						? `Won the ${view.season.name} championship.`
						: `Finished ${ORDINALS[(team.placement ?? 1) - 1]} in ${view.season.name}.`
				)
			)

const champions = placed('champions', (p) => p === 1)
const runnerUp = placed('runner-up', (p) => p === 2)
const podium = placed('podium', (p) => p <= 3)

const dynasty: Rule = (view) =>
	[...view.teams.values()]
		.filter((team) => team.placement === 1)
		.filter(
			(team) =>
				(view.earlierSeasons.get(team.teamId) ?? []).filter(
					(earlier) => earlier.placement === 1
				).length ===
				DYNASTY_TITLES - 1
		)
		.map((team) =>
			award(
				view,
				'dynasty',
				team.teamId,
				view.season.dateEnd,
				`Won a ${ORDINALS[DYNASTY_TITLES - 1]} championship, in ${view.season.name}.`
			)
		)

// ---- Registration badges ----------------------------------------------------

/**
 * Registered teams, earliest first. A date after the season began is not a
 * registration — 2023 Fall has one from the following summer — so it is left
 * out rather than trusted.
 */
const registeredInOrder = (view: SeasonView): BadgeTeamSeason[] =>
	registeredTeams(view)
		.filter(
			(team) =>
				team.registeredDate && team.registeredDate <= view.season.dateStart
		)
		.sort(
			(a, b) =>
				(a.registeredDate as Date).getTime() -
				(b.registeredDate as Date).getTime()
		)

const earlyBird: Rule = (view) => {
	const [first] = registeredInOrder(view)
	if (!first) return []
	return [
		award(
			view,
			'early-bird',
			first.teamId,
			first.registeredDate as Date,
			`First to register for ${view.season.name}, on ${leagueMonthDay(first.registeredDate as Date)}.`
		),
	]
}

const closeCall: Rule = (view) => {
	if (!registrationOver(view)) return []
	const ordered = registeredInOrder(view)
	const last = ordered.at(-1)
	if (!last || ordered.length < 2) return []
	return [
		award(
			view,
			'close-call',
			last.teamId,
			last.registeredDate as Date,
			`Took the last spot in ${view.season.name}, on ${leagueMonthDay(last.registeredDate as Date)}.`
		),
	]
}

// ---- Roster and history badges ------------------------------------------------

const welcome: Rule = (view) =>
	!seasonStarted(view)
		? []
		: registeredTeams(view)
				.filter((team) => seasonsRegisteredBefore(view, team.teamId) === 0)
				.map((team) =>
					award(
						view,
						'welcome',
						team.teamId,
						view.season.dateStart,
						`First season in the league, ${view.season.name}.`
					)
				)

const veteran: Rule = (view) =>
	!seasonStarted(view)
		? []
		: registeredTeams(view)
				.filter((team) => seasonsRegisteredBefore(view, team.teamId) > 0)
				.map((team) =>
					award(
						view,
						'veteran',
						team.teamId,
						view.season.dateStart,
						`Rolled over into ${view.season.name}.`
					)
				)

const oldGuard: Rule = (view) =>
	!seasonStarted(view)
		? []
		: registeredTeams(view)
				.filter(
					(team) =>
						seasonsRegisteredBefore(view, team.teamId) === OLD_GUARD_SEASON - 1
				)
				.map((team) =>
					award(
						view,
						'old-guard',
						team.teamId,
						view.season.dateStart,
						`Fifth season in the league, ${view.season.name}.`
					)
				)

const freshFaces: Rule = (view) => {
	if (!seasonStarted(view)) return []
	const veterans = new Set(
		view.facts.teamSeasons
			.filter((ts) => earlierThan(view, ts.seasonId))
			.flatMap((ts) => ts.roster)
	)
	return registeredTeams(view).flatMap((team) => {
		const newcomers = team.roster.filter((id) => !veterans.has(id)).length
		return newcomers >= FRESH_FACES_PLAYERS
			? [
					award(
						view,
						'fresh-faces',
						team.teamId,
						view.season.dateStart,
						`Started ${view.season.name} with ${newcomers} players new to the league.`
					),
				]
			: []
	})
}

const reunionTour: Rule = (view) => {
	if (!seasonStarted(view) || !view.previous) return []
	const previousId = view.previous.id
	const lastTeam = new Map<string, BadgeTeamSeason>()
	for (const ts of view.facts.teamSeasons) {
		if (ts.seasonId === previousId) {
			for (const id of ts.roster) lastTeam.set(id, ts)
		}
	}
	return registeredTeams(view).flatMap((team) => {
		const byFormerTeam = new Map<string, number>()
		for (const id of team.roster) {
			const former = lastTeam.get(id)
			if (former && former.teamId !== team.teamId) {
				byFormerTeam.set(
					former.teamId,
					(byFormerTeam.get(former.teamId) ?? 0) + 1
				)
			}
		}
		const [formerId, count] =
			[...byFormerTeam].sort((a, b) => b[1] - a[1])[0] ?? []
		if (!formerId || (count ?? 0) < REUNION_TOUR_PLAYERS) return []
		const formerName =
			view.facts.teamSeasons.find(
				(ts) => ts.teamId === formerId && ts.seasonId === previousId
			)?.name ?? 'another team'
		return [
			award(
				view,
				'reunion-tour',
				team.teamId,
				view.season.dateStart,
				`Started ${view.season.name} with ${count} of ${formerName}'s ${view.previous?.name} roster.`
			),
		]
	})
}

/** The season's top-rated rostered player as it began, by all-time rating. */
const celebrity: Rule = (view) => {
	if (!seasonStarted(view)) return []
	const firstGame = view.allResults[0]?.game.date ?? view.season.dateStart
	let best: { playerId: string; rating: number; teamIds: string[] } | null =
		null
	for (const team of view.teams.values()) {
		for (const playerId of team.roster) {
			const rating = view.facts.ratingBefore(playerId, firstGame)
			if (rating === null) continue
			if (!best || rating > best.rating) {
				best = { playerId, rating, teamIds: [team.teamId] }
			} else if (best.playerId === playerId) {
				best.teamIds.push(team.teamId)
			}
		}
	}
	if (!best) return []
	const name =
		view.facts.playerNames.get(best.playerId) ?? 'The top-rated player'
	return best.teamIds.map((teamId) =>
		award(
			view,
			'celebrity',
			teamId,
			view.season.dateStart,
			`${name} was the top-rated player as ${view.season.name} began.`
		)
	)
}

/** The team whose players' ratings rose most on average over the season. */
const risingStars: Rule = (view) => {
	if (!seasonOver(view)) return []
	const changes = view.facts.seasonRatingChanges.get(view.season.id)
	if (!changes) return []
	const averages = registeredTeams(view).flatMap((team) => {
		const rated = team.roster.filter((id) => changes.has(id))
		if (rated.length === 0) return []
		const average =
			rated.reduce((sum, id) => sum + (changes.get(id) ?? 0), 0) / rated.length
		return [{ teamId: team.teamId, average }]
	})
	const top = Math.max(...averages.map((a) => a.average))
	if (!Number.isFinite(top) || top <= 0) return []
	return averages
		.filter((a) => a.average === top)
		.map((a) =>
			award(
				view,
				'rising-stars',
				a.teamId,
				view.season.dateEnd,
				`Players' ratings rose ${a.average.toFixed(1)} on average over ${view.season.name}.`
			)
		)
}

// ---- Assembly ---------------------------------------------------------------

/** Every badge's rule, by badge id. */
export const RULES: Readonly<Record<string, Rule>> = {
	champions,
	'runner-up': runnerUp,
	dynasty,
	'perfect-season': perfectSeason,
	bagel,
	'early-bird': earlyBird,
	'close-call': closeCall,
	celebrity,
	'rising-stars': risingStars,
	podium,
	'giant-slayer': giantSlayer,
	merciless,
	'bounce-back': bounceBack,
	'frozen-out': frozenOut,
	'hot-streak': hotStreak,
	'show-off': showOff,
	speedrunners,
	'fresh-faces': freshFaces,
	'reunion-tour': reunionTour,
	'old-guard': oldGuard,
	'universe-point': universePoint,
	'just-warming-up': justWarmingUp,
	welcome,
	veteran,
	'turkey-bowl': turkeyBowl,
	'opening-night': openingNight,
	'last-dance': lastDance,
}

function earlierThan(view: SeasonView, seasonId: string): boolean {
	const order = view.facts.seasons.findIndex((s) => s.id === seasonId)
	const current = view.facts.seasons.findIndex((s) => s.id === view.season.id)
	return order !== -1 && order < current
}

function viewOf(facts: BadgeFacts, index: number): SeasonView {
	const season = facts.seasons[index]
	const teams = new Map(
		facts.teamSeasons
			.filter((ts) => ts.seasonId === season.id)
			.map((ts) => [ts.teamId, ts])
	)
	const earlierSeasons = new Map<string, BadgeTeamSeason[]>()
	for (const earlier of facts.seasons.slice(0, index)) {
		for (const ts of facts.teamSeasons) {
			if (ts.seasonId === earlier.id) {
				earlierSeasons.set(ts.teamId, [
					...(earlierSeasons.get(ts.teamId) ?? []),
					ts,
				])
			}
		}
	}
	const allResults: Result[] = facts.games
		.filter((game) => game.seasonId === season.id)
		.flatMap((game) =>
			(
				[
					[game.homeTeamId, game.awayTeamId, game.homeScore, game.awayScore],
					[game.awayTeamId, game.homeTeamId, game.awayScore, game.homeScore],
				] as const
			).map(([teamId, opponentId, scored, allowed]) => ({
				game,
				teamId,
				opponentId,
				scored,
				allowed,
				won: scored > allowed,
				lost: scored < allowed,
				night: leagueDayKey(game.date),
			}))
		)
	const results = new Map<string, Result[]>()
	for (const result of allResults) {
		results.set(result.teamId, [...(results.get(result.teamId) ?? []), result])
	}
	return {
		facts,
		season,
		teams,
		results,
		allResults,
		earlierSeasons,
		previous: index > 0 ? facts.seasons[index - 1] : undefined,
		teamName: (teamId) => teams.get(teamId)?.name ?? 'a former team',
	}
}

/** Every award earned in every season, by every rule. */
export function awardsFor(facts: BadgeFacts): Award[] {
	return facts.seasons.flatMap((_, index) => {
		const view = viewOf(facts, index)
		return Object.values(RULES).flatMap((rule) => rule(view))
	})
}
