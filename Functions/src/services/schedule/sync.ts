/**
 * Writes a season's schedule: the regular season once, when an admin
 * generates it, and the playoffs as the scores that decide them come in.
 *
 * Both run in a transaction that reads the season's games and teams and
 * writes what `plan.ts` calls for, so two score entries at once cannot
 * create the same game twice. The writes are bounded by the twelve-team
 * schedule — at most 61 for a season, 12 at a time for the playoffs — so a
 * transaction's 500-write limit is never near.
 */

import {
	FieldPath,
	Timestamp,
	type CollectionReference,
	type DocumentReference,
	type Firestore,
	type Query,
	type Transaction,
} from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { TRUESKILL_CONSTANTS } from '../playerRankings/constants.js'
import { seedTeams } from './standings.js'
import { leagueDayKey, leagueNights } from '../../shared/leagueCalendar.js'
import { gameSlotId } from '../../shared/gameSchedule.js'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	teamRef,
	teamSeasonRef,
} from '../../shared/database.js'
import {
	Collections,
	GameType,
	SeasonFormat,
	TEAM_SEASONS_SUBCOLLECTION,
	type GameDocument,
	type PlayerRankingDocument,
	type SeasonDocument,
	type TeamSeasonDocument,
} from '../../types.js'
import {
	planPlayoffs,
	planRegularSeason,
	ScheduleError,
	scoredGame,
	splitNights,
	stageOf,
	stageStarted,
	type PlannedGame,
	type ScheduleTeam,
	type SeasonNights,
	type StoredGame,
} from './plan.js'

/** A game as the admin's preview shows it. */
export interface ScheduledGameSummary {
	/** ISO 8601 kickoff. */
	date: string
	/** The night it is played on, "2026-11-07", on Minneapolis's calendar. */
	night: string
	field: number
	type: GameType
	homeTeamId: string
	homeName: string
	awayTeamId: string
	awayName: string
}

export interface GeneratedSchedule {
	seasonId: string
	/** ISO 8601 calendar days of the regular-season nights. */
	regularNights: string[]
	poolNight: string
	championshipNight: string
	games: ScheduledGameSummary[]
}

export interface PlayoffsSummary {
	seasonId: string
	/** Playoff games created. */
	created: number
	/** Unplayed playoff games given different teams after a correction. */
	updated: number
	/** Team-seasons whose placement was written. */
	placementsSet: number
	/** Slots taken by a game the playoffs did not create, left alone. */
	conflicts: string[]
	/**
	 * Unplayed games a corrected score would now pair differently, kept as
	 * they are because their night had already begun.
	 */
	kept: string[]
	/** Team-seasons whose `standingsRank` was written. */
	ranksSet: number
	/** What the next step waits for; null once the season is decided. */
	waitingFor: string | null
}

/** The season's state, as one transaction (or a dry run) reads it. */
interface SeasonState {
	seasonRef: DocumentReference<SeasonDocument>
	season: SeasonDocument
	nights: SeasonNights
	teams: ScheduleTeam[]
	games: StoredGame[]
	/** Each team's stored `standingsRank`. */
	ranks: Map<string, number | null>
}

const day = (date: Date): string => date.toISOString().slice(0, 10)

/** A ScheduleError as the callable's refusal; anything else rethrown. */
const asPrecondition = (error: unknown): never => {
	if (error instanceof ScheduleError) {
		throw new HttpsError('failed-precondition', error.message)
	}
	throw error
}

const storedGame = (id: string, data: GameDocument): StoredGame => ({
	id,
	date: data.date.toDate(),
	field: data.field,
	type: data.type,
	homeTeamId: data.home?.id ?? null,
	awayTeamId: data.away?.id ?? null,
	homeScore: data.homeScore ?? null,
	awayScore: data.awayScore ?? null,
	playoffSlot: data.playoffSlot ?? null,
})

/**
 * Reads the season, its registered teams and its games — inside `tx` when
 * given — and each team's rating from `ratings`.
 */
async function readSeason(
	firestore: Firestore,
	seasonId: string,
	ratings: Map<string, number | null>,
	tx?: Transaction
): Promise<SeasonState> {
	const seasonRef = firestore
		.collection(Collections.SEASONS)
		.doc(seasonId) as DocumentReference<SeasonDocument>
	const teamsQuery = firestore
		.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
		.where('season', '==', seasonRef) as Query<TeamSeasonDocument>
	const gamesQuery = firestore
		.collection(Collections.GAMES)
		.where('season', '==', seasonRef)
	const [seasonDoc, teamDocs, gameDocs] = await Promise.all([
		tx ? tx.get(seasonRef) : seasonRef.get(),
		tx ? tx.get(teamsQuery) : teamsQuery.get(),
		tx ? tx.get(gamesQuery) : gamesQuery.get(),
	])
	if (!seasonDoc.exists) {
		throw new HttpsError('not-found', 'Season not found.')
	}
	const season = seasonDoc.data() as SeasonDocument
	let nights: SeasonNights
	try {
		nights = splitNights(
			leagueNights(season.dateStart.toDate(), season.dateEnd.toDate())
		)
	} catch (error) {
		return asPrecondition(error)
	}
	const teams = teamDocs.docs
		.filter((doc) => doc.data().registered)
		.map((doc) => {
			const data = doc.data()
			const teamId = canonicalTeamIdFromTeamSeasonDoc(doc)
			return {
				teamId,
				name: data.name,
				registeredDate: data.registeredDate?.toDate() ?? null,
				rating: ratings.get(teamId) ?? null,
			}
		})
	const games = gameDocs.docs.map((doc) =>
		storedGame(doc.id, doc.data() as GameDocument)
	)
	const ranks = new Map(
		teamDocs.docs.map((doc) => [
			canonicalTeamIdFromTeamSeasonDoc(doc),
			doc.data().standingsRank ?? null,
		])
	)
	return { seasonRef, season, nights, teams, games, ranks }
}

/**
 * Each registered team's average player rating: the mean all-time rating of
 * its rostered players, a player new to the league counting at the rating
 * every player starts from. Before the first game it is the whole of the
 * standings' order; after, only an exact tie's last tiebreaker. Null for a
 * team with nobody rostered.
 */
async function teamRatings(
	firestore: Firestore,
	seasonId: string,
	teamIds: readonly string[]
): Promise<Map<string, number | null>> {
	const rosters = await Promise.all(
		teamIds.map(async (teamId) => {
			const roster = await teamSeasonRef(firestore, teamId, seasonId)
				.collection('roster')
				.get()
			return { teamId, playerIds: roster.docs.map((doc) => doc.id) }
		})
	)
	const playerIds = [...new Set(rosters.flatMap((r) => r.playerIds))]
	const rated = new Map<string, number>()
	const RANKINGS_PER_READ = 30
	for (let i = 0; i < playerIds.length; i += RANKINGS_PER_READ) {
		const chunk = playerIds.slice(i, i + RANKINGS_PER_READ)
		const docs = await firestore
			.collection(Collections.RANKINGS)
			.where(FieldPath.documentId(), 'in', chunk)
			.get()
		for (const doc of docs.docs) {
			const { rating } = doc.data() as PlayerRankingDocument
			if (typeof rating === 'number') rated.set(doc.id, rating)
		}
	}
	return new Map(
		rosters.map(({ teamId, playerIds: ids }) => {
			const ratings = ids.map(
				(id) => rated.get(id) ?? TRUESKILL_CONSTANTS.INITIAL_MU
			)
			return [
				teamId,
				ratings.length > 0
					? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
					: null,
			]
		})
	)
}

const nameOf = (teams: readonly ScheduleTeam[], teamId: string): string =>
	teams.find((team) => team.teamId === teamId)?.name ?? ''

const summarize = (
	game: PlannedGame,
	teams: readonly ScheduleTeam[]
): ScheduledGameSummary => ({
	date: game.date.toISOString(),
	night: leagueDayKey(game.date),
	field: game.field,
	type: game.type,
	homeTeamId: game.homeTeamId,
	homeName: nameOf(teams, game.homeTeamId),
	awayTeamId: game.awayTeamId,
	awayName: nameOf(teams, game.awayTeamId),
})

/** The game document a planned game is stored as, scores still empty. */
const gameDocument = (
	firestore: Firestore,
	state: SeasonState,
	game: PlannedGame
): GameDocument => ({
	home: teamRef(firestore, game.homeTeamId),
	homeName: nameOf(state.teams, game.homeTeamId),
	away: teamRef(firestore, game.awayTeamId),
	awayName: nameOf(state.teams, game.awayTeamId),
	homeScore: null,
	awayScore: null,
	field: game.field,
	type: game.type,
	date: Timestamp.fromDate(game.date),
	season: state.seasonRef,
	forfeit: null,
	...(game.playoffSlot && { playoffSlot: game.playoffSlot }),
})

/** A time and field, for telling whether a slot is taken. */
const slotKey = (date: Date, field: number): string =>
	`${date.getTime()}_${field}`

/**
 * A generated playoff game's id: one per season and slot, so concurrent
 * updates cannot create it twice, and never one a moved game still holds.
 */
const playoffGameId = (seasonId: string, slot: string): string =>
	`${seasonId}_${slot}`

const gamesRef = (firestore: Firestore): CollectionReference =>
	firestore.collection(Collections.GAMES)

/**
 * Creates every regular-season game for a traditional season with none
 * yet, and turns on its automatic playoffs. With `dryRun`, only says what
 * it would create.
 */
export async function generateRegularSeason(
	firestore: Firestore,
	seasonId: string,
	{ dryRun = false }: { dryRun?: boolean } = {}
): Promise<GeneratedSchedule> {
	const generated = await firestore.runTransaction(async (tx) => {
		const state = await readSeason(firestore, seasonId, new Map(), tx)
		if (state.season.format === SeasonFormat.SWISS) {
			throw new HttpsError(
				'failed-precondition',
				'A Swiss season is paired one night at a time from its standings; use the pairing guide.'
			)
		}
		if (state.games.length > 0) {
			throw new HttpsError(
				'failed-precondition',
				`This season already has ${state.games.length} games. A schedule is only generated for a season with none.`
			)
		}
		let planned: PlannedGame[]
		try {
			planned = planRegularSeason(state.nights, state.teams)
		} catch (error) {
			return asPrecondition(error)
		}
		if (!dryRun) {
			for (const game of planned) {
				tx.create(
					gamesRef(firestore).doc(gameSlotId(seasonId, game.date, game.field)),
					gameDocument(firestore, state, game)
				)
			}
			tx.update(state.seasonRef, { automaticPlayoffs: true })
		}
		return {
			seasonId,
			regularNights: state.nights.regular.map(day),
			poolNight: day(state.nights.poolNight),
			championshipNight: day(state.nights.championshipNight),
			games: planned.map((game) => summarize(game, state.teams)),
		}
	})
	// The standings' order before the first game, so the page has one at
	// once rather than when the first game write fires the trigger.
	if (!dryRun) await updatePlayoffs(firestore, seasonId)
	return generated
}

/**
 * Brings a season's playoffs up to date with its scores: creates the
 * playoff games the results decide, re-pairs any not yet played whose
 * teams a corrected score changed, and writes the placements once
 * championship night is decided. Once any game of a night has a score, that
 * night's pairing is fixed; games already played are never touched, and
 * nothing is ever deleted. Safe to run any number of times.
 */
export async function updatePlayoffs(
	firestore: Firestore,
	seasonId: string,
	{ dryRun = false }: { dryRun?: boolean } = {}
): Promise<PlayoffsSummary> {
	// Ratings are not written here, so reading them outside the transaction
	// cannot race it; a rebuild that changes them runs this again.
	const before = await readSeason(firestore, seasonId, new Map())
	if (!before.season.automaticPlayoffs) {
		throw new HttpsError(
			'failed-precondition',
			"This season's schedule was not generated, so its playoffs are not automatic."
		)
	}
	const ratings = await teamRatings(
		firestore,
		seasonId,
		before.teams.map((team) => team.teamId)
	)

	return firestore.runTransaction(async (tx) => {
		const state = await readSeason(firestore, seasonId, ratings, tx)
		let plan
		try {
			plan = planPlayoffs(state.nights, state.teams, state.games)
		} catch (error) {
			return asPrecondition(error)
		}
		const summary: PlayoffsSummary = {
			seasonId,
			created: 0,
			updated: 0,
			placementsSet: 0,
			conflicts: [],
			kept: [],
			ranksSet: 0,
			waitingFor: plan.waitingFor,
		}
		const bySlot = new Map(
			state.games
				.filter((game) => game.playoffSlot)
				.map((game) => [game.playoffSlot as string, game])
		)
		const storedIds = new Set(state.games.map((game) => game.id))
		// A slot is taken by any game at its time and field, wherever that
		// game's id says it was first created.
		const occupied = new Set(
			state.games.map((game) => slotKey(game.date, game.field))
		)
		const started = {
			pool: stageStarted(state.games, 'pool'),
			championship: stageStarted(state.games, 'championship'),
		}
		const writes: (() => void)[] = []

		for (const game of plan.games) {
			const slot = game.playoffSlot as string
			const stored = bySlot.get(slot)
			if (!stored) {
				const id = playoffGameId(seasonId, slot)
				if (storedIds.has(id) || occupied.has(slotKey(game.date, game.field))) {
					summary.conflicts.push(slot)
					continue
				}
				summary.created++
				writes.push(() =>
					tx.create(
						gamesRef(firestore).doc(id),
						gameDocument(firestore, state, game)
					)
				)
				continue
			}
			const played = stored.homeScore !== null || stored.awayScore !== null
			const sameTeams =
				stored.homeTeamId === game.homeTeamId &&
				stored.awayTeamId === game.awayTeamId
			if (played || sameTeams) continue
			if (started[stageOf(slot)]) {
				summary.kept.push(slot)
				continue
			}
			summary.updated++
			writes.push(() =>
				tx.update(gamesRef(firestore).doc(stored.id), {
					home: teamRef(firestore, game.homeTeamId),
					homeName: nameOf(state.teams, game.homeTeamId),
					away: teamRef(firestore, game.awayTeamId),
					awayName: nameOf(state.teams, game.awayTeamId),
				})
			)
		}

		if (plan.placements) {
			const current = await Promise.all(
				[...plan.placements].map(async ([teamId, placement]) => {
					const ref = teamSeasonRef(firestore, teamId, seasonId)
					const doc = await tx.get(ref)
					return { ref, placement, stored: doc.data()?.placement ?? null }
				})
			)
			for (const { ref, placement, stored } of current) {
				if (stored === placement) continue
				summary.placementsSet++
				writes.push(() => tx.update(ref, { placement }))
			}
		}

		// The regular season's order as it stands, which pool night is drawn
		// from; once pool night has begun, the order it was drawn in.
		if (!started.pool) {
			const regular = state.games
				.filter((game) => game.type === GameType.REGULAR)
				.flatMap((game) => {
					const scored = scoredGame(game)
					return scored ? [scored] : []
				})
			seedTeams(state.teams, regular).forEach((teamId, index) => {
				const rank = index + 1
				if (state.ranks.get(teamId) === rank) return
				summary.ranksSet++
				writes.push(() =>
					tx.update(teamSeasonRef(firestore, teamId, seasonId), {
						standingsRank: rank,
					})
				)
			})
		}

		if (!dryRun) for (const write of writes) write()
		return summary
	})
}

/**
 * Updates every generated season, for when what they depend on besides
 * their games changes: the ratings, after a rankings rebuild. A season that
 * cannot be scheduled is logged and skipped.
 */
export async function updateAutomaticSeasons(
	firestore: Firestore
): Promise<PlayoffsSummary[]> {
	const seasons = await firestore
		.collection(Collections.SEASONS)
		.where('automaticPlayoffs', '==', true)
		.get()
	const summaries: PlayoffsSummary[] = []
	for (const season of seasons.docs) {
		try {
			summaries.push(await updatePlayoffs(firestore, season.id))
		} catch (error) {
			if (error instanceof HttpsError && error.code === 'failed-precondition') {
				logger.warn('Playoffs not updated: the season cannot be scheduled', {
					seasonId: season.id,
					reason: error.message,
				})
				continue
			}
			throw error
		}
	}
	return summaries
}
