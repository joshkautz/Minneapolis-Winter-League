import { describe, expect, it } from 'vitest'
import { BADGES } from '../../badges/catalog.js'
import {
	RULES,
	awardsFor,
	type BadgeFacts,
	type BadgeGame,
	type BadgeSeason,
	type BadgeTeamSeason,
} from './rules.js'

/**
 * Each badge's rule, against small leagues built for it. Dates are noon UTC,
 * so a game's Minneapolis calendar day is the date written.
 */

const at = (day: string, hour = 0): Date =>
	new Date(`${day}T${String(18 + hour).padStart(2, '0')}:00:00Z`)

const season = (
	id: string,
	start: string,
	end: string,
	registrationEnd = start
): BadgeSeason => ({
	id,
	name: `${id} name`,
	dateStart: new Date(`${start}T06:00:00Z`),
	dateEnd: new Date(`${end}T06:00:00Z`),
	registrationEnd: new Date(`${registrationEnd}T05:59:00Z`),
})

const FALL = season('fall', '2026-11-07', '2026-12-20', '2026-10-31')
const SPRING = season('spring', '2027-03-06', '2027-04-25', '2027-02-28')
const AFTER_EVERYTHING = new Date('2028-01-01T00:00:00Z')

const team = (
	teamId: string,
	overrides: Partial<BadgeTeamSeason> = {}
): BadgeTeamSeason => ({
	teamId,
	seasonId: FALL.id,
	name: teamId.toUpperCase(),
	registered: true,
	registeredDate: new Date('2026-10-01T05:00:00Z'),
	placement: null,
	roster: [],
	...overrides,
})

let gameCount = 0
const game = (
	home: string,
	homeScore: number,
	away: string,
	awayScore: number,
	date: Date,
	overrides: Partial<BadgeGame> = {}
): BadgeGame => ({
	id: `game-${++gameCount}`,
	seasonId: FALL.id,
	date,
	type: 'regular',
	homeTeamId: home,
	awayTeamId: away,
	homeScore,
	awayScore,
	...overrides,
})

const facts = (overrides: Partial<BadgeFacts> = {}): BadgeFacts => ({
	now: AFTER_EVERYTHING,
	seasons: [FALL],
	teamSeasons: [team('a'), team('b'), team('c'), team('d')],
	games: [],
	ratingBefore: () => null,
	seasonRatingChanges: new Map(),
	playerNames: new Map(),
	...overrides,
})

/** Who earned `badgeId`, as team-season pairs, sorted. */
const earned = (badgeId: string, f: BadgeFacts): string[] =>
	awardsFor(f)
		.filter((award) => award.badgeId === badgeId)
		.map((award) => `${award.teamId}@${award.seasonId}`)
		.sort()

const reasonOf = (badgeId: string, f: BadgeFacts): string | undefined =>
	awardsFor(f).find((award) => award.badgeId === badgeId)?.reason

describe('the catalog and the rules', () => {
	it('gives every badge exactly one rule', () => {
		expect(Object.keys(RULES).sort()).toEqual(BADGES.map((b) => b.id).sort())
	})

	it('awards a team a badge at most once a season', () => {
		const f = facts({
			games: [
				game('a', 10, 'b', 9, at('2026-11-07')),
				game('a', 12, 'c', 11, at('2026-11-14')),
			],
		})
		expect(earned('universe-point', f)).toEqual(['a@fall'])
	})

	it('awards a badge again in another season', () => {
		const f = facts({
			seasons: [FALL, SPRING],
			teamSeasons: [
				team('a'),
				team('b'),
				team('a', { seasonId: SPRING.id }),
				team('b', { seasonId: SPRING.id }),
			],
			games: [
				game('a', 10, 'b', 9, at('2026-11-07')),
				game('a', 10, 'b', 9, at('2027-03-06'), { seasonId: SPRING.id }),
			],
		})
		expect(earned('universe-point', f)).toEqual(['a@fall', 'a@spring'])
	})
})

describe('game badges', () => {
	it.each([
		['universe-point', 10, 9, true],
		['universe-point', 10, 8, false],
		['bagel', 10, 0, true],
		['bagel', 10, 1, false],
		['frozen-out', 10, 3, true],
		['frozen-out', 10, 4, false],
		['merciless', 16, 1, true],
		['merciless', 15, 1, false],
		['show-off', 18, 17, true],
		['show-off', 17, 16, false],
		['speedrunners', 14, 13, true],
		['speedrunners', 13, 13, false],
	] as const)('%s: %i–%i earns it: %s', (badgeId, scored, allowed, wins) => {
		const f = facts({
			games: [game('a', scored, 'b', allowed, at('2026-11-07'))],
		})
		expect(earned(badgeId, f).includes('a@fall')).toBe(wins)
	})

	it('awards Speedrunners to both teams in the game', () => {
		const f = facts({ games: [game('a', 14, 'b', 13, at('2026-11-07'))] })
		expect(earned('speedrunners', f)).toEqual(['a@fall', 'b@fall'])
	})

	it('awards Just Warming Up for scoring 5 or fewer, win or lose', () => {
		const f = facts({ games: [game('a', 12, 'b', 5, at('2026-11-07'))] })
		expect(earned('just-warming-up', f)).toEqual(['b@fall'])
	})

	it('does not double the full stop after a name ending in one', () => {
		const f = facts({
			teamSeasons: [team('a'), team('b', { name: 'Seatbelt Inspection CO.' })],
			games: [
				game('a', 2, 'b', 12, at('2026-11-07')),
				game('a', 9, 'b', 8, at('2026-11-07', 1)),
			],
		})
		expect(reasonOf('bounce-back', f)).toBe(
			'Beat Seatbelt Inspection CO. after losing 2–12 to Seatbelt Inspection CO.'
		)
	})

	it('says how a game badge was won', () => {
		const f = facts({ games: [game('a', 16, 'b', 1, at('2026-11-14'))] })
		expect(reasonOf('merciless', f)).toBe('Beat B 16–1 on November 14.')
	})

	it('awards nothing for a game not in the facts, such as a forfeit', () => {
		expect(earned('bagel', facts())).toEqual([])
	})
})

describe('Bounce Back', () => {
	it('is won by beating anyone right after losing by 8 or more', () => {
		const f = facts({
			games: [
				game('a', 2, 'b', 10, at('2026-11-07')),
				game('a', 9, 'c', 8, at('2026-11-07', 1)),
			],
		})
		expect(earned('bounce-back', f)).toEqual(['a@fall'])
		expect(reasonOf('bounce-back', f)).toBe('Beat C after losing 2–10 to B.')
	})

	it('is not won after a closer loss, or by a win that is not next', () => {
		const f = facts({
			games: [
				game('a', 3, 'b', 10, at('2026-11-07')),
				game('a', 1, 'c', 12, at('2026-11-07', 1)),
				game('a', 5, 'd', 6, at('2026-11-14')),
				game('a', 9, 'b', 8, at('2026-11-14', 1)),
			],
		})
		expect(earned('bounce-back', f)).toEqual([])
	})
})

describe('Hot Streak', () => {
	const wins = (count: number): BadgeGame[] =>
		Array.from({ length: count }, (_, i) =>
			game('a', 10, 'b', 5, at(`2026-11-${String(7 + i).padStart(2, '0')}`))
		)

	it('is won on the fifth win in a row', () => {
		const f = facts({ games: wins(5) })
		expect(earned('hot-streak', f)).toEqual(['a@fall'])
		expect(
			awardsFor(f).find((a) => a.badgeId === 'hot-streak')?.earnedAt
		).toEqual(at('2026-11-11'))
	})

	it('is not won when a loss breaks the run', () => {
		const games = wins(5)
		games[2] = game('a', 1, 'b', 2, at('2026-11-09'))
		expect(earned('hot-streak', facts({ games }))).toEqual([])
	})
})

describe('Giant Slayer', () => {
	it('is won by beating the team with the most wins going into the night', () => {
		const f = facts({
			games: [
				game('a', 10, 'c', 5, at('2026-11-07')),
				game('a', 10, 'd', 5, at('2026-11-07', 1)),
				game('b', 10, 'a', 9, at('2026-11-14')),
			],
		})
		expect(earned('giant-slayer', f)).toEqual(['b@fall'])
	})

	it('is not won by a leader beating another leader', () => {
		const f = facts({
			games: [
				game('a', 10, 'c', 5, at('2026-11-07')),
				game('b', 10, 'd', 5, at('2026-11-07')),
				game('a', 10, 'b', 9, at('2026-11-14')),
			],
		})
		expect(earned('giant-slayer', f)).toEqual([])
	})

	it('is not won on the first night, before anyone leads', () => {
		const f = facts({ games: [game('a', 10, 'b', 5, at('2026-11-07'))] })
		expect(earned('giant-slayer', f)).toEqual([])
	})
})

describe('Opening Night', () => {
	it('is won by winning your first game, not a later one', () => {
		const f = facts({
			games: [
				game('a', 10, 'b', 5, at('2026-11-07')),
				game('b', 10, 'c', 5, at('2026-11-07', 1)),
			],
		})
		expect(earned('opening-night', f)).toEqual(['a@fall'])
	})
})

describe('Turkey Bowl', () => {
	it('is won by winning your first game after the Thanksgiving break', () => {
		const f = facts({
			games: [
				game('a', 10, 'b', 5, at('2026-11-21')),
				// 2026's break is November 28; December 5 is the first night back.
				game('c', 10, 'a', 5, at('2026-12-05')),
				game('a', 10, 'd', 5, at('2026-12-05', 1)),
				game('b', 10, 'd', 5, at('2026-12-05', 2)),
			],
		})
		expect(earned('turkey-bowl', f)).toEqual(['b@fall', 'c@fall'])
	})

	it('is not awarded in a season that does not span Thanksgiving', () => {
		const f = facts({
			seasons: [SPRING],
			teamSeasons: [
				team('a', { seasonId: SPRING.id }),
				team('b', { seasonId: SPRING.id }),
			],
			games: [game('a', 10, 'b', 5, at('2027-03-13'), { seasonId: SPRING.id })],
		})
		expect(earned('turkey-bowl', f)).toEqual([])
	})
})

describe('Last Dance', () => {
	const lastNight = [
		game('a', 10, 'b', 5, at('2026-12-12')),
		game('a', 10, 'c', 5, at('2026-12-12', 1)),
		game('b', 10, 'd', 5, at('2026-12-12', 2)),
		game('d', 3, 'b', 2, at('2026-12-12', 3)),
	]

	it('is won by winning every game on the last regular-season night', () => {
		const f = facts({
			games: [game('c', 10, 'd', 5, at('2026-12-05')), ...lastNight],
		})
		expect(earned('last-dance', f)).toEqual(['a@fall'])
	})

	it('waits until the regular season is over', () => {
		const f = facts({ games: lastNight, now: new Date('2026-12-13T00:00:00Z') })
		expect(earned('last-dance', f)).toEqual([])
	})

	it('counts the regular season over once playoffs begin', () => {
		const f = facts({
			games: [
				...lastNight,
				game('a', 10, 'b', 5, at('2026-12-19'), { type: 'playoff' }),
			],
			now: new Date('2026-12-19T23:00:00Z'),
		})
		expect(earned('last-dance', f)).toEqual(['a@fall'])
	})
})

describe('Perfect Season', () => {
	const regular = (scores: [number, number][]): BadgeGame[] =>
		scores.map(([scored, allowed], i) =>
			game(
				'a',
				scored,
				'b',
				allowed,
				at(`2026-11-${String(7 + i * 7).padStart(2, '0')}`)
			)
		)

	it('is won by winning every regular-season game, playoffs aside', () => {
		const f = facts({
			games: [
				...regular([
					[10, 5],
					[10, 5],
					[10, 5],
					[10, 5],
				]),
				game('b', 10, 'a', 5, at('2026-12-19'), { type: 'playoff' }),
			],
		})
		expect(earned('perfect-season', f)).toEqual(['a@fall'])
	})

	it('needs at least four games', () => {
		const f = facts({
			games: regular([
				[10, 5],
				[10, 5],
				[10, 5],
			]),
		})
		expect(earned('perfect-season', f)).toEqual([])
	})

	it('is lost to one loss', () => {
		const f = facts({
			games: regular([
				[10, 5],
				[10, 5],
				[4, 5],
				[10, 5],
			]),
		})
		expect(earned('perfect-season', f)).toEqual([])
	})

	it('waits until the regular season is over', () => {
		const f = facts({
			games: regular([
				[10, 5],
				[10, 5],
				[10, 5],
				[10, 5],
			]),
			now: new Date('2026-12-06T00:00:00Z'),
		})
		expect(earned('perfect-season', f)).toEqual([])
	})
})

describe('standings badges', () => {
	const placed = facts({
		teamSeasons: [
			team('a', { placement: 1 }),
			team('b', { placement: 2 }),
			team('c', { placement: 3 }),
			team('d', { placement: 4 }),
		],
	})

	it('awards Champions, Runner-up and Podium by placement', () => {
		expect(earned('champions', placed)).toEqual(['a@fall'])
		expect(earned('runner-up', placed)).toEqual(['b@fall'])
		expect(earned('podium', placed)).toEqual(['a@fall', 'b@fall', 'c@fall'])
		expect(reasonOf('runner-up', placed)).toBe('Finished second in fall name.')
	})

	it('awards nothing before placements are set', () => {
		expect(earned('champions', facts())).toEqual([])
	})

	it('awards Dynasty once, for the second championship', () => {
		const WINTER = season('winter', '2027-11-06', '2027-12-19')
		const f = facts({
			seasons: [FALL, SPRING, WINTER],
			teamSeasons: [
				team('a', { placement: 1 }),
				team('a', { seasonId: SPRING.id, placement: 1 }),
				team('a', { seasonId: WINTER.id, placement: 1 }),
			],
		})
		expect(earned('dynasty', f)).toEqual(['a@spring'])
	})
})

describe('registration badges', () => {
	const registeredAt = (day: string): Partial<BadgeTeamSeason> => ({
		registeredDate: new Date(`${day}T15:00:00Z`),
	})

	const f = facts({
		teamSeasons: [
			team('a', registeredAt('2026-10-03')),
			team('b', registeredAt('2026-10-01')),
			team('c', registeredAt('2026-10-20')),
			team('d', { registered: false, registeredDate: null }),
		],
	})

	it('awards Early Bird to the first team to register', () => {
		expect(earned('early-bird', f)).toEqual(['b@fall'])
		expect(reasonOf('early-bird', f)).toBe(
			'First to register for fall name, on October 1.'
		)
	})

	it('awards Close Call to the last team to register, once registration is over', () => {
		expect(earned('close-call', f)).toEqual(['c@fall'])
		expect(
			earned('close-call', { ...f, now: new Date('2026-10-25T00:00:00Z') })
		).toEqual([])
	})

	it('ignores a registration date after the season began', () => {
		// 2023 Fall has one from the following summer; it is not when that
		// team took its spot.
		const stray = facts({
			teamSeasons: [
				team('a', registeredAt('2026-10-03')),
				team('b', registeredAt('2026-10-05')),
				team('c', registeredAt('2027-08-27')),
			],
		})
		expect(earned('close-call', stray)).toEqual(['b@fall'])
	})

	it('counts registration over once every spot is taken', () => {
		const full = facts({
			now: new Date('2026-10-02T00:00:00Z'),
			teamSeasons: Array.from({ length: 12 }, (_, i) =>
				team(`t${i}`, { registeredDate: new Date(1_790_000_000_000 + i) })
			),
		})
		expect(earned('close-call', full)).toEqual(['t11@fall'])
	})
})

describe('roster and history badges', () => {
	const roster = (prefix: string, count: number): string[] =>
		Array.from({ length: count }, (_, i) => `${prefix}${i}`)

	it('awards Welcome to a new team and Veteran to a returning one', () => {
		const f = facts({
			seasons: [FALL, SPRING],
			teamSeasons: [
				team('a'),
				team('a', { seasonId: SPRING.id }),
				team('b', { seasonId: SPRING.id }),
				// Entered last season but never registered: still new.
				team('c', { registered: false }),
				team('c', { seasonId: SPRING.id }),
			],
		})
		expect(earned('welcome', f)).toEqual(['a@fall', 'b@spring', 'c@spring'])
		expect(earned('veteran', f)).toEqual(['a@spring'])
	})

	it('waits for the season to start', () => {
		const f = facts({ now: new Date('2026-11-01T00:00:00Z') })
		expect(earned('welcome', f)).toEqual([])
	})

	it('awards Old Guard in a team’s fifth registered season only', () => {
		const seasons = Array.from({ length: 6 }, (_, i) =>
			season(`s${i}`, `${2030 + i}-11-02`, `${2030 + i}-12-20`)
		)
		const f = facts({
			now: new Date('2040-01-01T00:00:00Z'),
			seasons,
			teamSeasons: seasons.map((s) => team('a', { seasonId: s.id })),
		})
		expect(earned('old-guard', f)).toEqual(['a@s4'])
	})

	it('awards Fresh Faces for ten players new to the league', () => {
		const f = facts({
			seasons: [FALL, SPRING],
			teamSeasons: [
				team('a', { roster: roster('old', 3) }),
				team('b', {
					seasonId: SPRING.id,
					roster: [...roster('new', 10), 'old0'],
				}),
				team('c', {
					seasonId: SPRING.id,
					roster: [...roster('fresh', 9), 'old1'],
				}),
			],
		})
		expect(earned('fresh-faces', f)).toEqual(['b@spring'])
	})

	it('awards Welcome and Fresh Faces in the league’s first season', () => {
		// 2023 Fall was the first season the league played: every team and
		// player in it really was new.
		const f = facts({ teamSeasons: [team('a', { roster: roster('p', 12) })] })
		expect(earned('welcome', f)).toEqual(['a@fall'])
		expect(earned('fresh-faces', f)).toEqual(['a@fall'])
	})

	it('awards Reunion Tour for five of one other team’s last-season players', () => {
		const f = facts({
			seasons: [FALL, SPRING],
			teamSeasons: [
				team('a', { roster: roster('p', 6) }),
				team('b', { seasonId: SPRING.id, roster: roster('p', 5) }),
				// Coming back together on the same team is not a reunion.
				team('a', { seasonId: SPRING.id, roster: ['p5'] }),
			],
		})
		expect(earned('reunion-tour', f)).toEqual(['b@spring'])
		expect(reasonOf('reunion-tour', f)).toBe(
			"Started spring name with 5 of A's fall name roster."
		)
	})

	it('awards Celebrity to the team with the top-rated player as the season began', () => {
		const ratings: Record<string, number> = { star: 40, solid: 30 }
		const f = facts({
			teamSeasons: [
				team('a', { roster: ['solid'] }),
				team('b', { roster: ['star'] }),
			],
			games: [game('a', 10, 'b', 5, at('2026-11-07'))],
			ratingBefore: (playerId, date) =>
				date <= at('2026-11-07') ? (ratings[playerId] ?? null) : 99,
			playerNames: new Map([['star', 'Sky Star']]),
		})
		expect(earned('celebrity', f)).toEqual(['b@fall'])
		expect(reasonOf('celebrity', f)).toBe(
			'Sky Star was the top-rated player as fall name began.'
		)
	})

	it('awards Rising Stars to the team whose ratings rose most, after the season', () => {
		const f = facts({
			teamSeasons: [
				team('a', { roster: ['a1', 'a2'] }),
				team('b', { roster: ['b1', 'b2'] }),
			],
			seasonRatingChanges: new Map([
				[
					FALL.id,
					new Map([
						['a1', 2],
						['a2', 4],
						['b1', 1],
						['b2', 1],
					]),
				],
			]),
		})
		expect(earned('rising-stars', f)).toEqual(['a@fall'])
		expect(
			earned('rising-stars', { ...f, now: new Date('2026-12-01T00:00:00Z') })
		).toEqual([])
	})

	it('awards no Rising Stars when no team’s ratings rose', () => {
		const f = facts({
			teamSeasons: [team('a', { roster: ['a1'] })],
			seasonRatingChanges: new Map([[FALL.id, new Map([['a1', -2]])]]),
		})
		expect(earned('rising-stars', f)).toEqual([])
	})
})
