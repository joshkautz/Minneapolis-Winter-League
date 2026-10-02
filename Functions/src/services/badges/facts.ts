/**
 * Reads everything the badge rules need, in a handful of queries: every
 * season, team-season, roster entry and game, and every player's rating
 * history and season rankings.
 */

import type { Firestore } from 'firebase-admin/firestore'
import {
	Collections,
	ROSTER_SUBCOLLECTION,
	SEASON_RANKINGS_SUBCOLLECTION,
	TEAM_SEASONS_SUBCOLLECTION,
	type GameDocument,
	type PlayerRankingHistoryDocument,
	type SeasonDocument,
	type SeasonRankingDocument,
	type TeamRosterDocument,
	type TeamSeasonDocument,
} from '../../types.js'
import type {
	BadgeFacts,
	BadgeGame,
	BadgeSeason,
	BadgeTeamSeason,
} from './rules.js'

const key = (teamId: string, seasonId: string): string =>
	`${teamId}/${seasonId}`

/** A game that was played: both teams, both scores, and no forfeit. */
export function playedGame(id: string, game: GameDocument): BadgeGame | null {
	if (
		!game.home ||
		!game.away ||
		typeof game.homeScore !== 'number' ||
		typeof game.awayScore !== 'number' ||
		game.forfeit
	) {
		return null
	}
	return {
		id,
		seasonId: game.season.id,
		date: game.date.toDate(),
		type: game.type,
		homeTeamId: game.home.id,
		awayTeamId: game.away.id,
		homeScore: game.homeScore,
		awayScore: game.awayScore,
	}
}

/**
 * A lookup of each player's all-time rating just before a moment, from the
 * rating they held after every round.
 */
export function ratingLookup(
	histories: ReadonlyMap<string, { date: Date; rating: number }[]>
): BadgeFacts['ratingBefore'] {
	return (playerId, date) => {
		const rounds = histories.get(playerId)
		if (!rounds) return null
		let rating: number | null = null
		for (const round of rounds) {
			if (round.date >= date) break
			rating = round.rating
		}
		return rating
	}
}

export async function loadBadgeFacts(
	firestore: Firestore,
	now: Date
): Promise<BadgeFacts> {
	const [seasons, teamSeasons, rosters, games, histories, standings] =
		await Promise.all([
			firestore.collection(Collections.SEASONS).get(),
			firestore.collectionGroup(TEAM_SEASONS_SUBCOLLECTION).get(),
			firestore.collectionGroup(ROSTER_SUBCOLLECTION).get(),
			firestore.collection(Collections.GAMES).get(),
			firestore.collection(Collections.PLAYER_RANKING_HISTORY).get(),
			firestore.collectionGroup(SEASON_RANKINGS_SUBCOLLECTION).get(),
		])

	const rostersByTeamSeason = new Map<string, string[]>()
	for (const doc of rosters.docs) {
		const teamSeason = doc.ref.parent.parent
		const teamId = teamSeason?.parent.parent?.id
		const player = (doc.data() as TeamRosterDocument).player
		if (!teamSeason || !teamId || !player) continue
		const k = key(teamId, teamSeason.id)
		rostersByTeamSeason.set(k, [
			...(rostersByTeamSeason.get(k) ?? []),
			player.id,
		])
	}

	const badgeSeasons: BadgeSeason[] = seasons.docs
		.map((doc) => {
			const season = doc.data() as SeasonDocument
			return {
				id: doc.id,
				name: season.name,
				dateStart: season.dateStart.toDate(),
				dateEnd: season.dateEnd.toDate(),
				registrationEnd: season.registrationEnd.toDate(),
			}
		})
		.sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime())

	const badgeTeamSeasons: BadgeTeamSeason[] = teamSeasons.docs.flatMap(
		(doc) => {
			const teamId = doc.ref.parent.parent?.id
			if (!teamId) return []
			const teamSeason = doc.data() as TeamSeasonDocument
			return [
				{
					teamId,
					seasonId: doc.id,
					name: teamSeason.name.trim(),
					registered: teamSeason.registered === true,
					registeredDate: teamSeason.registeredDate?.toDate() ?? null,
					placement:
						typeof teamSeason.placement === 'number'
							? teamSeason.placement
							: null,
					roster: rostersByTeamSeason.get(key(teamId, doc.id)) ?? [],
				},
			]
		}
	)

	const playedGames = games.docs
		.flatMap((doc) => playedGame(doc.id, doc.data() as GameDocument) ?? [])
		.sort((a, b) => a.date.getTime() - b.date.getTime())

	const ratingRounds = new Map<string, { date: Date; rating: number }[]>()
	const playerNames = new Map<string, string>()
	for (const doc of histories.docs) {
		const history = doc.data() as PlayerRankingHistoryDocument
		playerNames.set(doc.id, history.playerName)
		ratingRounds.set(
			doc.id,
			(history.rounds ?? [])
				.map((round) => ({ date: round.date.toDate(), rating: round.rating }))
				.sort((a, b) => a.date.getTime() - b.date.getTime())
		)
	}

	// The collection group also matches the top-level `rankings`, which is
	// the all-time leaderboard; only the seasons' standings are wanted.
	const seasonRatingChanges = new Map<string, Map<string, number>>()
	for (const doc of standings.docs) {
		const season = doc.ref.parent.parent
		if (season?.parent.id !== Collections.SEASONS) continue
		const standing = doc.data() as SeasonRankingDocument
		const changes = seasonRatingChanges.get(season.id) ?? new Map()
		seasonRatingChanges.set(
			season.id,
			changes.set(doc.id, standing.ratingChange)
		)
	}

	return {
		now,
		seasons: badgeSeasons,
		teamSeasons: badgeTeamSeasons,
		games: playedGames,
		ratingBefore: ratingLookup(ratingRounds),
		seasonRatingChanges,
		playerNames,
	}
}
