/**
 * The weekly game-night email: every Thursday, each rostered player on a
 * team with games that Saturday hears its games, where it stands and what
 * the night decides.
 *
 * The pure functions below decide what each team's email says; the last,
 * `queueGameNightEmails`, reads the season and queues one email per player
 * under a stable id, so a rerun sends nothing twice. It sends nothing in a
 * week without a game night — Thanksgiving, the off-season — or before the
 * night's games exist.
 */

import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	getCurrentSeason,
} from '../shared/database.js'
import { gameTimeLabel, GAME_TIME_SLOTS } from '../shared/gameRules.js'
import {
	DAY_MS,
	leagueCalendarDay,
	leagueDayKey,
	leagueNights,
	leagueWallClock,
} from '../shared/leagueCalendar.js'
import { recordsOf, type ScoredGame } from '../services/schedule/standings.js'
import {
	Collections,
	ROSTER_SUBCOLLECTION,
	TEAM_SEASONS_SUBCOLLECTION,
	type GameDocument,
	type SeasonDocument,
	type TeamRosterDocument,
	type TeamSeasonDocument,
} from '../types.js'
import { queueEmailOnce } from './outbox.js'
import type { GameNightGame, GameNightProps } from './templates/GameNight.js'

/** How many days ahead a Thursday email looks for the Saturday. */
const LOOKAHEAD_DAYS = 3

/** A season's game, as these emails read it. */
export interface SeasonGame {
	date: Date
	field: number
	type: string
	playoffSlot: string | null
	homeTeamId: string | null
	awayTeamId: string | null
	homeScore: number | null
	awayScore: number | null
}

/** A team taking part this season. */
export interface SeasonTeam {
	teamId: string
	name: string
	standingsRank: number | null
}

/**
 * The game night coming up within the next few days, as its "2026-11-14"
 * key, or null when there is none. Tonight never counts: by Saturday's
 * games it is too late to email about them.
 */
export function upcomingNight(
	nights: readonly Date[],
	now: Date
): string | null {
	const today = leagueCalendarDay(now).getTime()
	const night = nights.find((candidate) => {
		const days = (candidate.getTime() - today) / DAY_MS
		return days >= 1 && days <= LOOKAHEAD_DAYS
	})
	return night ? night.toISOString().slice(0, 10) : null
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export const ordinal = (n: number): string => {
	const lastTwo = n % 100
	if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
	return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

type NightKind = 'regular' | 'pool' | 'championship' | 'playoff'

const kindOf = (games: readonly SeasonGame[]): NightKind => {
	if (games.some((game) => game.playoffSlot?.startsWith('pool'))) return 'pool'
	if (games.some((game) => game.playoffSlot?.startsWith('championship'))) {
		return 'championship'
	}
	return games.some((game) => game.type === 'playoff') ? 'playoff' : 'regular'
}

/**
 * What the night is called: its place among the regular-season nights,
 * counted from the games themselves so a season scheduled by hand works
 * too, or the playoff night it is.
 */
function nightLabel(
	kind: NightKind,
	nightKey: string,
	seasonGames: readonly SeasonGame[]
): string {
	if (kind === 'pool') return 'Pool night'
	if (kind === 'championship') return 'Championship night'
	if (kind === 'playoff') return 'Playoffs'
	const regularNights = new Set(
		seasonGames
			.filter((game) => game.type !== 'playoff')
			.map((game) => leagueDayKey(game.date))
	)
	const week = [...regularNights].filter((key) => key <= nightKey).length
	return `Week ${week}`
}

/** The places a championship-night field plays for, as "1–4". */
const placesOnField = (field: number): [number, number] => [
	(field - 1) * 4 + 1,
	field * 4,
]

/** "Saturday, November 14", from "2026-11-14". */
const nightDateOf = (nightKey: string): string =>
	new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(`${nightKey}T00:00:00Z`))

/**
 * One team's email for the night, or null when it has no game that night.
 * Its record counts only games before the night.
 */
export function teamGameNight({
	team,
	teams,
	seasonName,
	nightKey,
	seasonGames,
}: {
	team: SeasonTeam
	teams: readonly SeasonTeam[]
	seasonName: string
	nightKey: string
	seasonGames: readonly SeasonGame[]
}): GameNightProps | null {
	const nightGames = seasonGames.filter(
		(game) => leagueDayKey(game.date) === nightKey
	)
	const own = nightGames
		.filter(
			(game) =>
				game.homeTeamId === team.teamId || game.awayTeamId === team.teamId
		)
		.sort((a, b) => a.date.getTime() - b.date.getTime())
	if (own.length === 0) return null

	const names = new Map(teams.map((entry) => [entry.teamId, entry.name]))
	const games: GameNightGame[] = own.map((game) => {
		const opponentId =
			game.homeTeamId === team.teamId ? game.awayTeamId : game.homeTeamId
		return {
			time: gameTimeLabel(leagueWallClock(game.date).time),
			field: game.field,
			opponent: opponentId ? (names.get(opponentId) ?? null) : null,
		}
	})

	const nightStart = new Date(`${nightKey}T00:00:00Z`).getTime()
	const earlier: ScoredGame[] = seasonGames.flatMap((game) =>
		leagueCalendarDay(game.date).getTime() < nightStart &&
		game.homeTeamId &&
		game.awayTeamId &&
		game.homeScore !== null &&
		game.awayScore !== null
			? [
					{
						homeTeamId: game.homeTeamId,
						awayTeamId: game.awayTeamId,
						homeScore: game.homeScore,
						awayScore: game.awayScore,
					},
				]
			: []
	)
	const record = recordsOf(
		teams.map((entry) => entry.teamId),
		earlier
	).get(team.teamId)
	const played = record ? record.wins + record.losses > 0 : false
	const kind = kindOf(nightGames)
	const rank = team.standingsRank

	const standing = !played
		? null
		: kind === 'pool'
			? `${team.name} finished the regular season ${record?.wins}–${record?.losses}${rank ? `, seeded ${ordinal(rank)}` : ''}.`
			: kind === 'regular'
				? `${team.name} is ${record?.wins}–${record?.losses}${rank ? `, ${ordinal(rank)} of ${teams.length} teams` : ''}.`
				: `${team.name} is ${record?.wins}–${record?.losses} this season.`

	let note: string | null = null
	if (kind === 'pool') {
		note =
			'Pool night decides your bracket on championship night: each pool’s winner plays for places 1–4, its second for 5–8 and its third for 9–12.'
	} else if (kind === 'championship') {
		const [first, last] = placesOnField(own[0].field)
		note = `Field ${own[0].field} decides places ${first}–${last}. Win your first game and you play for ${ordinal(first)} at ${gameTimeLabel(GAME_TIME_SLOTS[3])}; lose it and you play for ${ordinal(first + 2)} at ${gameTimeLabel(GAME_TIME_SLOTS[2])}.`
	}

	return {
		teamName: team.name,
		seasonName,
		nightDate: nightDateOf(nightKey),
		nightLabel: nightLabel(kind, nightKey, seasonGames),
		games,
		standing,
		note,
	}
}

export interface GameNightSummary {
	/** The night emailed about, or null when there is none this week. */
	night: string | null
	teams: number
	queued: number
	/** Already queued by an earlier run, so not queued again. */
	alreadyQueued: number
}

/** The email id for one player's game night: one each, however often run. */
export const gameNightMailId = (
	seasonId: string,
	nightKey: string,
	playerId: string
): string => `gameNight-${seasonId}-${nightKey}-${playerId}`

/**
 * Queues the coming game night's email for every rostered player whose
 * registered team plays that night. With `dryRun`, counts without queueing.
 */
export async function queueGameNightEmails(
	firestore: Firestore,
	{ now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {}
): Promise<GameNightSummary> {
	const empty = (night: string | null): GameNightSummary => ({
		night,
		teams: 0,
		queued: 0,
		alreadyQueued: 0,
	})

	const season = (await getCurrentSeason()) as
		(SeasonDocument & { id: string }) | null
	if (!season) return empty(null)
	const nightKey = upcomingNight(
		leagueNights(season.dateStart.toDate(), season.dateEnd.toDate()),
		now
	)
	if (!nightKey) return empty(null)

	const seasonRef = firestore.collection(Collections.SEASONS).doc(season.id)
	const seasonGames: SeasonGame[] = (
		await firestore
			.collection(Collections.GAMES)
			.where('season', '==', seasonRef)
			.get()
	).docs.map((doc) => {
		const game = doc.data() as GameDocument
		return {
			date: game.date.toDate(),
			field: game.field,
			type: game.type,
			playoffSlot: game.playoffSlot ?? null,
			homeTeamId: game.home?.id ?? null,
			awayTeamId: game.away?.id ?? null,
			homeScore: game.homeScore ?? null,
			awayScore: game.awayScore ?? null,
		}
	})

	const teamSeasons = (
		await firestore
			.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
			.where('season', '==', seasonRef)
			.get()
	).docs.filter(
		(doc) => (doc.data() as TeamSeasonDocument).registered
	) as QueryDocumentSnapshot<TeamSeasonDocument>[]
	const teams: SeasonTeam[] = teamSeasons.map((doc) => {
		const data = doc.data()
		return {
			teamId: canonicalTeamIdFromTeamSeasonDoc(doc),
			name: data.name,
			standingsRank: data.standingsRank ?? null,
		}
	})

	const summary = empty(nightKey)
	await Promise.all(
		teamSeasons.map(async (doc, index) => {
			const props = teamGameNight({
				team: teams[index],
				teams,
				seasonName: season.name,
				nightKey,
				seasonGames,
			})
			if (!props) return
			summary.teams++
			const roster = await doc.ref.collection(ROSTER_SUBCOLLECTION).get()
			for (const entry of roster.docs) {
				const playerId =
					(entry.data() as TeamRosterDocument).player?.id ?? entry.id
				if (dryRun) {
					summary.queued++
					continue
				}
				const outcome = await queueEmailOnce(firestore, {
					id: gameNightMailId(season.id, nightKey, playerId),
					to: { playerId },
					template: 'gameNight',
					props,
				})
				if (outcome === 'queued') summary.queued++
				else summary.alreadyQueued++
			}
		})
	)
	return summary
}
