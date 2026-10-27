import { describe, expect, it } from 'vitest'
import {
	ordinal,
	teamGameNight,
	upcomingNight,
	type SeasonGame,
	type SeasonTeam,
} from './gameNightEmails.js'
import { leagueNights } from '../shared/leagueCalendar.js'
import { renderEmail } from './render.js'
import { TEMPLATES } from './templates.js'

/** Season 5: November 7 to December 19, 2026, Thanksgiving weekend off. */
const NIGHTS = leagueNights(
	new Date('2026-11-07T06:00:00Z'),
	new Date('2026-12-20T06:00:00Z')
)

/** Noon on a Minneapolis Thursday (CST). */
const thursdayNoon = (day: string) => new Date(`${day}T18:00:00Z`)

/** A kickoff on Minneapolis's clock in November and December (CST). */
const kickoff = (day: string, time: string) => {
	const [hours, minutes] = time.split(':').map(Number)
	return new Date(
		Date.UTC(
			Number(day.slice(0, 4)),
			Number(day.slice(5, 7)) - 1,
			Number(day.slice(8, 10)),
			hours + 6,
			minutes
		)
	)
}

const game = (
	day: string,
	time: string,
	field: number,
	home: string | null,
	away: string | null,
	overrides: Partial<SeasonGame> = {}
): SeasonGame => ({
	date: kickoff(day, time),
	field,
	type: 'regular',
	playoffSlot: null,
	homeTeamId: home,
	awayTeamId: away,
	homeScore: null,
	awayScore: null,
	...overrides,
})

const scored = (g: SeasonGame, home: number, away: number): SeasonGame => ({
	...g,
	homeScore: home,
	awayScore: away,
})

const TEAMS: SeasonTeam[] = [
	{ teamId: 'goop', name: 'Goop', standingsRank: 2 },
	{ teamId: 'owls', name: 'Snow Owls', standingsRank: 5 },
	{ teamId: 'duck', name: 'Grey Duck', standingsRank: 9 },
]

const forGoop = (nightKey: string, seasonGames: SeasonGame[]) =>
	teamGameNight({
		team: TEAMS[0],
		teams: TEAMS,
		seasonName: 'Season 5',
		nightKey,
		seasonGames,
	})

describe('upcomingNight', () => {
	it('finds the Saturday after a Thursday', () => {
		expect(upcomingNight(NIGHTS, thursdayNoon('2026-11-12'))).toBe('2026-11-14')
	})

	it('finds none in Thanksgiving week, which the league takes off', () => {
		expect(upcomingNight(NIGHTS, thursdayNoon('2026-11-26'))).toBeNull()
	})

	it('finds none outside the season', () => {
		expect(upcomingNight(NIGHTS, thursdayNoon('2026-10-29'))).toBe(null)
		expect(upcomingNight(NIGHTS, thursdayNoon('2026-12-24'))).toBe(null)
	})

	it('never counts tonight, when it is too late to email', () => {
		expect(upcomingNight(NIGHTS, new Date('2026-11-14T15:00:00Z'))).toBe(null)
	})
})

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
		[22, '22nd'],
	])('%i is %s', (n, word) => {
		expect(ordinal(n)).toBe(word)
	})
})

describe('teamGameNight', () => {
	const week1 = [
		game('2026-11-07', '18:00', 1, 'goop', 'owls'),
		game('2026-11-07', '18:45', 2, 'duck', 'goop'),
	]
	const week2 = [
		game('2026-11-14', '19:30', 3, 'owls', 'goop'),
		game('2026-11-14', '20:15', 1, 'goop', 'duck'),
	]

	it('lists the team’s games in order, with times on the league’s clock', () => {
		expect(forGoop('2026-11-07', [...week1, ...week2])).toMatchObject({
			teamName: 'Goop',
			nightDate: 'Saturday, November 7',
			nightLabel: 'Week 1',
			games: [
				{ time: '6:00pm', field: 1, opponent: 'Snow Owls' },
				{ time: '6:45pm', field: 2, opponent: 'Grey Duck' },
			],
			standing: null,
			note: null,
		})
	})

	it('gives the record before the night, and the place in the standings', () => {
		const played = [scored(week1[0], 13, 9), scored(week1[1], 13, 11)]

		expect(forGoop('2026-11-14', [...played, ...week2])).toMatchObject({
			nightLabel: 'Week 2',
			standing: 'Goop is 1–1, 2nd of 3 teams.',
		})
	})

	it('counts weeks from the games, so a season scheduled by hand works', () => {
		const later = [game('2026-12-05', '18:00', 1, 'goop', 'owls')]

		expect(
			forGoop('2026-12-05', [...week1, ...week2, ...later])?.nightLabel
		).toBe('Week 3')
	})

	it('is null for a team without a game that night', () => {
		expect(
			teamGameNight({
				team: { teamId: 'idle', name: 'Idle', standingsRank: null },
				teams: TEAMS,
				seasonName: 'Season 5',
				nightKey: '2026-11-07',
				seasonGames: week1,
			})
		).toBeNull()
	})

	it('says what pool night decides, and the seed it was drawn from', () => {
		const pool = [
			game('2026-12-12', '18:00', 1, 'goop', 'owls', {
				type: 'playoff',
				playoffSlot: 'pool-r1-f1',
			}),
		]

		expect(
			forGoop('2026-12-12', [scored(week1[0], 13, 9), ...pool])
		).toMatchObject({
			nightLabel: 'Pool night',
			standing: 'Goop finished the regular season 1–0, seeded 2nd.',
			note: expect.stringMatching(/^Pool night decides your bracket/),
		})
	})

	it('says which places a championship field plays for, and how', () => {
		const championship = [
			game('2026-12-19', '18:45', 2, 'goop', 'duck', {
				type: 'playoff',
				playoffSlot: 'championship-r2-f2',
			}),
		]

		const email = forGoop('2026-12-19', championship)

		expect(email).toMatchObject({
			nightLabel: 'Championship night',
			note: 'Field 2 decides places 5–8. Win your first game and you play for 5th at 8:15pm; lose it and you play for 7th at 7:30pm.',
		})
	})

	it('says when an opponent is still to be decided', () => {
		const tbd = [game('2026-12-19', '20:15', 1, 'goop', null)]

		expect(forGoop('2026-12-19', tbd)?.games).toEqual([
			{ time: '8:15pm', field: 1, opponent: null },
		])
	})
})

describe('the game-night email', () => {
	it('can be turned off, as game-night email', () => {
		expect(TEMPLATES.gameNight.category).toBe('games')
	})

	it('names the night, the games and where to look', async () => {
		const { subject, text } = await renderEmail(
			'gameNight',
			TEMPLATES.gameNight.sample,
			{ recipientFirstName: 'Alex', unsubscribeUrl: 'https://example.com/u' }
		)

		expect(subject).toBe('Frost Giants: Week 2, November 14')
		expect(text).toContain('6:00pm · Field 1')
		expect(text).toContain('against Snow Owls')
		expect(text).toContain('/schedule')
		expect(text).toContain('/standings')
	})
})
