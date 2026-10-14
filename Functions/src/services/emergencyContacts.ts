/**
 * Every registered team's roster for a season, with the emergency contacts
 * each player gave when they signed that season's waiver — what organizers
 * want to hand on game day, team by team.
 *
 * The contacts live only on the signature records, which are private to
 * the player and admins, so this is read by an admin callable rather than
 * opened to the client.
 */

import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	playerSeasonRef,
} from '../shared/database.js'
import {
	Collections,
	ROSTER_SUBCOLLECTION,
	TEAM_SEASONS_SUBCOLLECTION,
	WAIVER_SIGNATURES_SUBCOLLECTION,
	type PlayerDocument,
	type TeamRosterDocument,
	type TeamSeasonDocument,
	type WaiverSignatureDocument,
} from '../types.js'

export interface EmergencyContact {
	name: string
	relationship: string
	phone: string
}

/**
 * - `contacts`: signed in the app, with the contacts given then
 * - `recorded`: an admin marked them signed (a paper waiver, say), so the
 *   app holds no contacts for them
 * - `unsigned`: no waiver for this season
 */
export type ContactStatus = 'contacts' | 'recorded' | 'unsigned'

export interface RosterContacts {
	playerId: string
	name: string
	captain: boolean
	status: ContactStatus
	contacts: EmergencyContact[]
}

export interface TeamContacts {
	teamId: string
	teamName: string
	players: RosterContacts[]
}

export interface SeasonEmergencyContacts {
	seasonName: string
	teams: TeamContacts[]
}

/** The season's signature that speaks for the player: their own, newest first. */
function bestSignature(
	signatures: WaiverSignatureDocument[]
): WaiverSignatureDocument | null {
	const newestFirst = [...signatures].sort(
		(a, b) => b.signedAt.toMillis() - a.signedAt.toMillis()
	)
	return (
		newestFirst.find((signature) => signature.method === 'player') ??
		newestFirst[0] ??
		null
	)
}

async function rosterContacts(
	firestore: Firestore,
	seasonId: string,
	playerId: string
): Promise<RosterContacts> {
	const playerDocRef = firestore.collection(Collections.PLAYERS).doc(playerId)
	const [playerSnap, playerSeasonSnap, signaturesSnap] = await Promise.all([
		playerDocRef.get(),
		playerSeasonRef(firestore, playerId, seasonId).get(),
		playerDocRef
			.collection(WAIVER_SIGNATURES_SUBCOLLECTION)
			.where('seasonId', '==', seasonId)
			.get(),
	])
	const player = playerSnap.data() as PlayerDocument | undefined
	const signature = bestSignature(
		signaturesSnap.docs.map((doc) => doc.data() as WaiverSignatureDocument)
	)
	const contacts = signature?.emergencyContacts ?? []
	return {
		playerId,
		name: player
			? `${player.firstname} ${player.lastname}`.trim()
			: 'Deleted account',
		captain: playerSeasonSnap.data()?.captain === true,
		status: !signature
			? 'unsigned'
			: contacts.length > 0
				? 'contacts'
				: 'recorded',
		contacts: contacts.map(({ name, relationship, phone }) => ({
			name,
			relationship,
			phone,
		})),
	}
}

/** Captains first, then by name. */
const rosterOrder = (a: RosterContacts, b: RosterContacts): number =>
	Number(b.captain) - Number(a.captain) || a.name.localeCompare(b.name)

/**
 * The season's registered teams, by name, each with its roster's
 * contacts. Null when the season does not exist.
 */
export async function seasonEmergencyContacts(
	firestore: Firestore,
	seasonId: string
): Promise<SeasonEmergencyContacts | null> {
	const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
	const seasonSnap = await seasonRef.get()
	if (!seasonSnap.exists) return null

	// Filtered here rather than in the query, which would need a composite
	// collection-group index for a dozen documents.
	const teamSeasons = (
		await firestore
			.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
			.where('season', '==', seasonRef)
			.get()
	).docs.filter(
		(doc) => (doc.data() as TeamSeasonDocument).registered === true
	) as QueryDocumentSnapshot<TeamSeasonDocument>[]

	const teams = await Promise.all(
		teamSeasons.map(async (doc): Promise<TeamContacts> => {
			const teamSeason = doc.data()
			const roster = await doc.ref.collection(ROSTER_SUBCOLLECTION).get()
			const players = await Promise.all(
				roster.docs.map((entry) =>
					rosterContacts(
						firestore,
						seasonId,
						(entry.data() as TeamRosterDocument).player?.id ?? entry.id
					)
				)
			)
			return {
				teamId: canonicalTeamIdFromTeamSeasonDoc(doc),
				teamName: teamSeason.name,
				players: players.sort(rosterOrder),
			}
		})
	)

	return {
		seasonName: (seasonSnap.data()?.name as string | undefined) ?? seasonId,
		teams: teams.sort((a, b) => a.teamName.localeCompare(b.teamName)),
	}
}
