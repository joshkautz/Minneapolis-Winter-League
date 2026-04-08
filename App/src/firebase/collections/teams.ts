/**
 * Team-related Firestore operations (2026 data model)
 *
 * Teams are now canonical (one doc per real team forever). Per-season
 * state lives in the `teamSeasons` subcollection on each team. The roster
 * for a (team, season) pair lives at
 * `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`.
 *
 * "All teams in season X" is a `collectionGroup('teamSeasons')` query
 * bounded by a season ref. Each result doc's `ref.parent.parent` is the
 * canonical team document — prefer `canonicalTeamIdFromTeamSeasonDoc` /
 * `canonicalTeamRefFromTeamSeasonDoc` below over touching `parent.parent`
 * directly.
 */

import {
	collection,
	collectionGroup,
	doc,
	documentId,
	query,
	where,
	type CollectionReference,
	type DocumentReference,
	type DocumentSnapshot,
	type Query,
	type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	Collections,
	SeasonDocument,
	TEAM_SEASONS_SUBCOLLECTION,
	TeamDocument,
	TeamRosterDocument,
	TeamSeasonDocument,
} from '@/shared/utils'

// ---- Canonical team document ---------------------------------------------

/**
 * Get a canonical team document reference by id.
 */
export const getTeamRef = (
	id: string | undefined
): DocumentReference<TeamDocument> | undefined => {
	if (!id) return undefined
	return doc(
		firestore,
		Collections.TEAMS,
		id
	) as DocumentReference<TeamDocument>
}

/**
 * Query for multiple canonical teams by their refs.
 */
export const teamsQuery = (
	teams: (DocumentReference<TeamDocument> | null)[] | undefined
): Query<TeamDocument> | undefined => {
	if (!teams || !teams.length) return undefined
	return query(
		collection(firestore, Collections.TEAMS),
		where(documentId(), 'in', teams)
	) as Query<TeamDocument>
}

/**
 * Query for the entire canonical teams collection.
 */
export const allTeamsQuery = (): Query<TeamDocument> => {
	return collection(firestore, Collections.TEAMS) as Query<TeamDocument>
}

// ---- Per-team season subcollection ---------------------------------------

/**
 * Get a single team-season subdoc reference.
 */
export const teamSeasonRef = (
	teamId: string,
	seasonId: string
): DocumentReference<TeamSeasonDocument> => {
	return doc(
		firestore,
		Collections.TEAMS,
		teamId,
		TEAM_SEASONS_SUBCOLLECTION,
		seasonId
	) as DocumentReference<TeamSeasonDocument>
}

/**
 * Query for every season subdoc under a single team (i.e. the team's
 * full season history).
 */
export const teamSeasonsQuery = (
	teamId: string | undefined
): Query<TeamSeasonDocument> | undefined => {
	if (!teamId) return undefined
	return query(
		collection(firestore, Collections.TEAMS, teamId, TEAM_SEASONS_SUBCOLLECTION)
	) as Query<TeamSeasonDocument>
}

/**
 * Query for every team participating in a given season. Uses a
 * collection-group query against the `seasons` subcollection (which lives
 * under each team document).
 *
 * Each result doc's `ref.parent.parent` is the canonical `teams/{teamId}`
 * document.
 */
export const teamsInSeasonQuery = (
	seasonRef: DocumentReference<SeasonDocument> | undefined
): Query<TeamSeasonDocument> | undefined => {
	if (!seasonRef) return undefined
	return query(
		collectionGroup(firestore, TEAM_SEASONS_SUBCOLLECTION),
		where('season', '==', seasonRef)
	) as Query<TeamSeasonDocument>
}

// ---- Canonical derivation from team season doc snapshots -----------------

/**
 * Derive the canonical team id from a team-season subdoc snapshot. Use this
 * at every collection-group call site instead of reaching into
 * `doc.ref.parent.parent.id`.
 */
export const canonicalTeamIdFromTeamSeasonDoc = (
	doc:
		| QueryDocumentSnapshot<TeamSeasonDocument>
		| DocumentSnapshot<TeamSeasonDocument>
): string => {
	const teamRef = doc.ref.parent.parent
	if (!teamRef) throw new Error('TeamSeasonDocument has no parent team')
	return teamRef.id
}

/**
 * Derive the canonical team document reference from a team-season subdoc
 * snapshot. Use this at every collection-group call site instead of
 * reaching into `doc.ref.parent.parent`.
 */
export const canonicalTeamRefFromTeamSeasonDoc = (
	doc:
		| QueryDocumentSnapshot<TeamSeasonDocument>
		| DocumentSnapshot<TeamSeasonDocument>
): DocumentReference<TeamDocument> => {
	const teamRef = doc.ref.parent.parent
	if (!teamRef) throw new Error('TeamSeasonDocument has no parent team')
	return teamRef as DocumentReference<TeamDocument>
}

/** Legacy alias preserved for callers that use the old name. */
export const teamsBySeasonQuery = teamsInSeasonQuery

// ---- Roster subcollection ------------------------------------------------

/**
 * Get the roster collection reference for a team-season.
 */
export const teamRosterSubcollection = (
	teamId: string,
	seasonId: string
): CollectionReference<TeamRosterDocument> => {
	return collection(
		firestore,
		Collections.TEAMS,
		teamId,
		TEAM_SEASONS_SUBCOLLECTION,
		seasonId,
		'roster'
	) as CollectionReference<TeamRosterDocument>
}
