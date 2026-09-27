/**
 * Reads everything a rebuild needs, in a handful of queries: every season,
 * every game, every roster entry and the names of every rostered player.
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type GameDocument,
	type PlayerDocument,
	type TeamRosterDocument,
} from '../../../types.js'
import {
	rosterKey,
	type EngineGame,
	type EngineInput,
} from '../engine/rankingEngine.js'

export interface LoadedRankingInput {
	input: EngineInput
	/** Season id → every player on a roster that season. */
	seasonRosters: Map<string, Set<string>>
	seasonIds: string[]
}

/** Firestore's `getAll` is fastest in chunks of a few hundred. */
const NAME_READ_CHUNK = 300

export async function loadRankingInput(
	firestore: Firestore
): Promise<LoadedRankingInput> {
	const [seasonsSnapshot, gamesSnapshot, rosterSnapshot] = await Promise.all([
		firestore.collection(Collections.SEASONS).get(),
		firestore.collection(Collections.GAMES).get(),
		// Every `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`.
		firestore.collectionGroup('roster').get(),
	])

	const games: EngineGame[] = gamesSnapshot.docs.map((doc) => {
		const game = doc.data() as GameDocument
		return {
			id: doc.id,
			seasonId: game.season.id,
			date: game.date.toDate(),
			type: game.type,
			homeTeamId: game.home?.id ?? null,
			awayTeamId: game.away?.id ?? null,
			homeScore: game.homeScore,
			awayScore: game.awayScore,
		}
	})

	const rosters = new Map<string, string[]>()
	const seasonRosters = new Map<string, Set<string>>()
	const playerRefs = new Map<string, DocumentReference>()
	for (const doc of rosterSnapshot.docs) {
		const teamSeason = doc.ref.parent.parent
		const teamId = teamSeason?.parent.parent?.id
		const seasonId = teamSeason?.id
		const player = (doc.data() as TeamRosterDocument).player
		if (!teamId || !seasonId || !player) {
			logger.warn(`Roster entry ${doc.ref.path} has no player ref`)
			continue
		}
		const key = rosterKey(teamId, seasonId)
		rosters.set(key, [...(rosters.get(key) ?? []), player.id])
		seasonRosters.set(
			seasonId,
			(seasonRosters.get(seasonId) ?? new Set()).add(player.id)
		)
		playerRefs.set(player.id, player)
	}

	const playerNames = new Map<string, string>()
	const refs = [...playerRefs.values()]
	for (let i = 0; i < refs.length; i += NAME_READ_CHUNK) {
		const snapshots = await firestore.getAll(
			...refs.slice(i, i + NAME_READ_CHUNK)
		)
		for (const snapshot of snapshots) {
			const player = snapshot.data() as PlayerDocument | undefined
			if (player) {
				playerNames.set(snapshot.id, `${player.firstname} ${player.lastname}`)
			}
		}
	}

	return {
		input: { games, rosters, playerNames },
		seasonRosters,
		seasonIds: seasonsSnapshot.docs.map((doc) => doc.id),
	}
}
