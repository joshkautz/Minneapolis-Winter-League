/**
 * Player ↔ team membership write helpers.
 *
 * # The denormalization invariant
 *
 * The "this player is on this team for this season" relationship is stored
 * in TWO places by design:
 *
 *   1. teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}
 *        → carries `player` (canonical ref) + `dateJoined`
 *
 *   2. players/{playerId}/playerSeasons/{seasonId}.team
 *        → carries the canonical team ref (or null if free agent)
 *
 * Firestore has no joins and no inverse references, so storing only one side
 * forces every read of the other direction into a collection-group query.
 * Both directions are hot paths in this app:
 *
 *   - "What team am I on?" runs on every authenticated page render.
 *   - "Who's on this team?" runs on team profile, captain manage, public
 *     teams, and admin views.
 *
 * Storing both sides keeps each read O(1) at the cost of having to write
 * both sides on every membership change. Writing both atomically — and
 * routing all membership changes through this module — is what guarantees
 * the two sides never drift.
 *
 * # Rules
 *
 * - **Never write to roster/{playerId} or playerSeasons/{seasonId}.team
 *   directly.** Always go through this module.
 * - **All membership writes are transactional.** The helpers take a
 *   `Transaction` argument so callers can compose them with other writes
 *   (last-captain checks, registration-state recomputation, etc.).
 * - **Reads needed for invariant checks** (e.g. "is this player already on
 *   another team?") are the caller's responsibility, because Firestore
 *   transactions require all reads before any writes. The helpers only do
 *   the writes.
 * - **Captain status changes** that don't change membership (promote/demote
 *   on a player who is already on the team) only touch the player season
 *   subdoc. The roster entry is just `{player, dateJoined}` — it does NOT
 *   carry captain state. There's only one place to update.
 *
 * # Why this module exists
 *
 * The 2026 v2 refactor introduced this dual-write pattern. Before
 * centralizing here, five different files (`offerUpdated.ts`,
 * `updateRoster.ts`, `updatePlayerAdmin.ts`, `updateTeamAdmin.ts`,
 * `userDeleted.ts`) each implemented their own version of the dual-write,
 * and one drifted (a missing `team: null` reset on remove). Centralizing
 * here means a future schema change touches one file.
 *
 * @see PlayerSeasonDocument.team in types.ts (the player-side ref)
 * @see TeamRosterDocument in types.ts (the team-side membership doc)
 */

import { Timestamp, type Transaction } from 'firebase-admin/firestore'
import {
	playerRef,
	playerSeasonRef,
	teamRef,
	teamRosterEntryRef,
} from './database.js'
import type {
	DocumentReference,
	PlayerSeasonDocument,
	SeasonDocument,
} from '../types.js'

/**
 * Atomically add a player to a team's roster for a given season.
 *
 * Writes BOTH sides of the player↔team relationship in one transaction:
 *   - Creates `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`
 *   - Creates or updates `players/{playerId}/playerSeasons/{seasonId}` so
 *     its `team` field points at the canonical team.
 *
 * The caller is responsible for any pre-write invariant reads (e.g. "is the
 * player already on another team?", "does the team season exist?", "is
 * registration still open?"). This helper does no validation; it only
 * performs the writes.
 *
 * @param transaction - The Firestore transaction inside which to write.
 * @param firestore - The admin Firestore instance.
 * @param params.playerId - Canonical player id (the `players/{uid}` doc id).
 * @param params.teamId - Canonical team id (the `teams/{teamId}` doc id).
 * @param params.seasonId - The season doc id.
 * @param params.seasonRef - The season document reference (used to write
 *   the player season doc when it doesn't already exist).
 * @param params.captain - Initial captain status. Defaults to false.
 * @param params.existingPlayerSeason - If the caller has already read the
 *   player season subdoc (and must have, for invariant checks), pass it
 *   here so the helper doesn't have to re-read inside the transaction.
 *   Pass `null` to indicate "I checked and it doesn't exist".
 */
export function addPlayerToTeam(
	transaction: Transaction,
	firestore: FirebaseFirestore.Firestore,
	params: {
		playerId: string
		teamId: string
		seasonId: string
		seasonRef: DocumentReference<SeasonDocument>
		captain?: boolean
		existingPlayerSeason: PlayerSeasonDocument | null
	}
): void {
	const { playerId, teamId, seasonId, seasonRef, existingPlayerSeason } = params
	const captain = params.captain ?? false

	const rosterEntryDocRef = teamRosterEntryRef(
		firestore,
		teamId,
		seasonId,
		playerId
	)
	const playerCanonicalRef = playerRef(firestore, playerId)
	const teamCanonicalRef = teamRef(firestore, teamId)
	const playerSeasonDocRef = playerSeasonRef(firestore, playerId, seasonId)

	// Team-side: pure membership join.
	transaction.set(rosterEntryDocRef, {
		player: playerCanonicalRef,
		dateJoined: Timestamp.now(),
	})

	// Player-side: create or update the season subdoc with the team ref.
	if (existingPlayerSeason) {
		transaction.update(playerSeasonDocRef, {
			team: teamCanonicalRef,
			captain,
		})
	} else {
		const newPlayerSeason: PlayerSeasonDocument = {
			season: seasonRef,
			team: teamCanonicalRef,
			paid: false,
			signed: false,
			banned: false,
			captain,
		}
		transaction.set(playerSeasonDocRef, newPlayerSeason)
	}
}

/**
 * Atomically remove a player from a team's roster for a given season.
 *
 * Writes BOTH sides of the player↔team relationship in one transaction:
 *   - Deletes `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`
 *   - Updates `players/{playerId}/playerSeasons/{seasonId}` to set
 *     `team: null` and `captain: false`.
 *
 * The caller is responsible for any pre-write invariant reads (e.g.
 * last-captain check, registered-team threshold check). This helper does
 * no validation; it only performs the writes.
 *
 * The player season subdoc is always updated, never deleted — it still
 * carries `paid`/`signed`/`banned` state that's relevant after the player
 * leaves.
 */
export function removePlayerFromTeam(
	transaction: Transaction,
	firestore: FirebaseFirestore.Firestore,
	params: {
		playerId: string
		teamId: string
		seasonId: string
	}
): void {
	const { playerId, teamId, seasonId } = params

	const rosterEntryDocRef = teamRosterEntryRef(
		firestore,
		teamId,
		seasonId,
		playerId
	)
	const playerSeasonDocRef = playerSeasonRef(firestore, playerId, seasonId)

	transaction.delete(rosterEntryDocRef)
	transaction.update(playerSeasonDocRef, {
		team: null,
		captain: false,
	})
}

/**
 * Atomically set a player's captain status for a given season.
 *
 * Captain state lives ONLY on the player season subdoc — the roster entry
 * is just `{player, dateJoined}`. So unlike membership writes, this only
 * touches one document and is included here for symmetry and so that all
 * captain/membership writes go through this module.
 */
export function setPlayerCaptainStatus(
	transaction: Transaction,
	firestore: FirebaseFirestore.Firestore,
	params: {
		playerId: string
		seasonId: string
		captain: boolean
	}
): void {
	const { playerId, seasonId, captain } = params
	const playerSeasonDocRef = playerSeasonRef(firestore, playerId, seasonId)
	transaction.update(playerSeasonDocRef, { captain })
}
