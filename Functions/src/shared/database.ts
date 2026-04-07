/**
 * Database utilities for Firebase Functions
 */

import { getFirestore } from 'firebase-admin/firestore'
import {
	Collections,
	DocumentReference,
	PlayerDocument,
	PlayerSeasonDocument,
	SeasonDocument,
	TeamBadgeDocument,
	TeamDocument,
	TeamRosterDocument,
	TeamSeasonDocument,
} from '../types.js'
import { logger } from 'firebase-functions/v2'

// ---- Canonical document reference helpers ---------------------------------
//
// These return strongly-typed DocumentReferences/CollectionReferences for the
// 2026 data model shape. Prefer these over building paths inline so that any
// future schema changes only need to be made here.

export function teamRef(
	firestore: FirebaseFirestore.Firestore,
	teamId: string
): DocumentReference<TeamDocument> {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId) as DocumentReference<TeamDocument>
}

export function teamSeasonRef(
	firestore: FirebaseFirestore.Firestore,
	teamId: string,
	seasonId: string
): DocumentReference<TeamSeasonDocument> {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId)
		.collection('seasons')
		.doc(seasonId) as DocumentReference<TeamSeasonDocument>
}

export function teamRosterEntryRef(
	firestore: FirebaseFirestore.Firestore,
	teamId: string,
	seasonId: string,
	playerId: string
): DocumentReference<TeamRosterDocument> {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId)
		.collection('seasons')
		.doc(seasonId)
		.collection('roster')
		.doc(playerId) as DocumentReference<TeamRosterDocument>
}

export function teamBadgeRef(
	firestore: FirebaseFirestore.Firestore,
	teamId: string,
	badgeId: string
): DocumentReference<TeamBadgeDocument> {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId)
		.collection('badges')
		.doc(badgeId) as DocumentReference<TeamBadgeDocument>
}

export function playerRef(
	firestore: FirebaseFirestore.Firestore,
	playerId: string
): DocumentReference<PlayerDocument> {
	return firestore
		.collection(Collections.PLAYERS)
		.doc(playerId) as DocumentReference<PlayerDocument>
}

export function playerSeasonRef(
	firestore: FirebaseFirestore.Firestore,
	playerId: string,
	seasonId: string
): DocumentReference<PlayerSeasonDocument> {
	return firestore
		.collection(Collections.PLAYERS)
		.doc(playerId)
		.collection('seasons')
		.doc(seasonId) as DocumentReference<PlayerSeasonDocument>
}

/**
 * Read a player's per-season subdoc. Returns null if it doesn't exist.
 */
export async function getPlayerSeason(
	firestore: FirebaseFirestore.Firestore,
	playerId: string,
	seasonId: string
): Promise<PlayerSeasonDocument | null> {
	const snap = await playerSeasonRef(firestore, playerId, seasonId).get()
	return snap.exists ? (snap.data() ?? null) : null
}

/**
 * Read a team's per-season subdoc. Returns null if it doesn't exist.
 */
export async function getTeamSeason(
	firestore: FirebaseFirestore.Firestore,
	teamId: string,
	seasonId: string
): Promise<TeamSeasonDocument | null> {
	const snap = await teamSeasonRef(firestore, teamId, seasonId).get()
	return snap.exists ? (snap.data() ?? null) : null
}

/**
 * Gets the current season (most recent by dateStart)
 */
export async function getCurrentSeason(): Promise<SeasonDocument | null> {
	try {
		const firestore = getFirestore()
		const seasonsSnapshot = await firestore
			.collection(Collections.SEASONS)
			.orderBy('dateStart', 'desc')
			.limit(1)
			.get()

		if (seasonsSnapshot.empty) {
			logger.warn('No seasons found in database')
			return null
		}

		const seasonDoc = seasonsSnapshot.docs[0]
		const seasonData = seasonDoc.data() as SeasonDocument
		return { ...seasonData, id: seasonDoc.id }
	} catch (error) {
		logger.error('Error getting current season:', error)
		throw new Error('Failed to get current season')
	}
}

/**
 * Gets the current season document reference
 */
export async function getCurrentSeasonRef(): Promise<FirebaseFirestore.DocumentReference> {
	const firestore = getFirestore()
	const seasonsSnapshot = await firestore
		.collection(Collections.SEASONS)
		.orderBy('dateStart', 'desc')
		.limit(1)
		.get()

	if (seasonsSnapshot.empty) {
		throw new Error('No current season found')
	}

	return seasonsSnapshot.docs[0].ref
}
