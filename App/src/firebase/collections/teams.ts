/**
 * Team-related Firestore operations (2026 data model)
 *
 * Teams are now canonical (one doc per real team forever). Per-season
 * state lives in the `seasons` subcollection on each team. The roster
 * for a (team, season) pair lives at
 * `teams/{teamId}/seasons/{seasonId}/roster/{playerId}`.
 *
 * "All teams in season X" is a `collectionGroup('seasons')` query bounded
 * by a season ref. Each result doc's `ref.parent.parent` is the canonical
 * team document — use that to navigate to the team profile or to load the
 * canonical fields.
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
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	Collections,
	SeasonDocument,
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

/** Convenience alias preserved for callers that already use the legacy name. */
export const getTeamById = getTeamRef

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
		'seasons',
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
		collection(firestore, Collections.TEAMS, teamId, 'seasons')
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
		collectionGroup(firestore, 'seasons'),
		where('season', '==', seasonRef)
	) as Query<TeamSeasonDocument>
}

// ---- Roster subcollection ------------------------------------------------

/**
 * Get a single roster entry reference.
 */
export const teamRosterEntryRef = (
	teamId: string,
	seasonId: string,
	playerId: string
): DocumentReference<TeamRosterDocument> => {
	return doc(
		firestore,
		Collections.TEAMS,
		teamId,
		'seasons',
		seasonId,
		'roster',
		playerId
	) as DocumentReference<TeamRosterDocument>
}

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
		'seasons',
		seasonId,
		'roster'
	) as CollectionReference<TeamRosterDocument>
}

/**
 * Query for every roster entry under a team-season.
 */
export const teamRosterQuery = (
	teamId: string | undefined,
	seasonId: string | undefined
): Query<TeamRosterDocument> | undefined => {
	if (!teamId || !seasonId) return undefined
	return teamRosterSubcollection(teamId, seasonId)
}
