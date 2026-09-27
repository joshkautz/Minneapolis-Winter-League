/**
 * Who hears about an invitation or a request to join a team, and what they
 * are told:
 *
 * | Event                | Invitation (captain → player) | Request (player → team) |
 * | -------------------- | ----------------------------- | ----------------------- |
 * | Sent                 | the player                    | every captain           |
 * | Accepted             | every captain                 | the player              |
 * | Declined             | every captain                 | the player              |
 * | Withdrawn            | the player                    | every captain           |
 * | Player joined a      | that team's captains          | that team's captains    |
 * | different team       |                               |                         |
 *
 * Withdrawing and re-sending the same offer must not email the other side
 * over and over. So an offer sent again within a day of its being canceled
 * sends nothing and is marked `sentQuietly`, and withdrawing a quietly sent
 * offer sends nothing either: however often the loop runs, the other side
 * hears once that it was sent and once that it was withdrawn.
 *
 * The emails are queued in the transaction that makes the change, so one
 * goes out only if the change was saved. A transaction reads before it
 * writes, so read the context with `readTeamOfferContext` before any write.
 */

import type {
	Firestore,
	Query,
	Timestamp,
	Transaction,
} from 'firebase-admin/firestore'
import {
	Collections,
	OfferStatus,
	OfferType,
	PLAYER_SEASONS_SUBCOLLECTION,
	type PlayerDocument,
	type PlayerSeasonDocument,
} from '../types.js'
import {
	canonicalPlayerIdFromPlayerSeasonDoc,
	playerRef,
	teamRef,
	teamSeasonRef,
} from '../shared/database.js'
import { queueEmailInTransaction } from './outbox.js'

/** How long after an offer is canceled sending it again stays quiet. */
export const RESENT_OFFER_QUIET_MS = 24 * 60 * 60 * 1000

/**
 * Whether a new offer replaces one canceled so recently that the other side
 * has already been emailed about it. An offer between a player and a team
 * reuses one document, so `previous` is what that document held before.
 */
export function isQuietResend(
	previous: { status?: OfferStatus; respondedAt?: Timestamp } | undefined,
	now: Date
): boolean {
	if (previous?.status !== OfferStatus.CANCELED || !previous.respondedAt) {
		return false
	}
	return now.getTime() - previous.respondedAt.toMillis() < RESENT_OFFER_QUIET_MS
}

/** What the team emails say, read once per change. */
export interface TeamOfferContext {
	playerId: string
	playerName: string
	teamName: string
	seasonName: string
	/** The team's captains this season, who answer and hear about requests. */
	captainIds: string[]
}

/** "First Last", as the league shows a player elsewhere. */
export const playerDisplayName = (
	player: Partial<PlayerDocument> | undefined
): string =>
	[player?.firstname, player?.lastname].filter(Boolean).join(' ').trim() ||
	'A player'

/** Reads the names and captains a team email needs. */
export async function readTeamOfferContext(
	transaction: Transaction,
	firestore: Firestore,
	{
		playerId,
		teamId,
		seasonId,
	}: { playerId: string; teamId: string; seasonId: string }
): Promise<TeamOfferContext> {
	const [player, teamSeason, season, captainSeasons] = await Promise.all([
		transaction.get(playerRef(firestore, playerId)),
		transaction.get(teamSeasonRef(firestore, teamId, seasonId)),
		transaction.get(firestore.collection(Collections.SEASONS).doc(seasonId)),
		// Served by the playerSeasons (team, captain) index. It spans every
		// season the team has played; a player-season's id is its season's.
		transaction.get(
			firestore
				.collectionGroup(PLAYER_SEASONS_SUBCOLLECTION)
				.where('team', '==', teamRef(firestore, teamId))
				.where('captain', '==', true) as Query<PlayerSeasonDocument>
		),
	])
	return {
		playerId,
		playerName: playerDisplayName(player.data()),
		teamName: teamSeason.data()?.name ?? 'your team',
		seasonName: season.data()?.name ?? 'this season',
		captainIds: captainSeasons.docs
			.filter((doc) => doc.id === seasonId)
			.map((doc) => canonicalPlayerIdFromPlayerSeasonDoc(doc)),
	}
}

/** Tells the other side that an invitation or request has been sent. */
export function queueOfferSentEmails(
	transaction: Transaction,
	firestore: Firestore,
	{
		type,
		context,
		captainName,
	}: { type: OfferType; context: TeamOfferContext; captainName: string }
): void {
	const { playerId, playerName, teamName, seasonName, captainIds } = context
	if (type === OfferType.INVITATION) {
		queueEmailInTransaction(transaction, firestore, {
			to: { playerId },
			template: 'teamInvitation',
			props: { teamName, seasonName, captainName },
		})
		return
	}
	for (const captainId of captainIds) {
		queueEmailInTransaction(transaction, firestore, {
			to: { playerId: captainId },
			template: 'teamJoinRequest',
			props: { teamName, seasonName, playerName },
		})
	}
}

/** Tells whoever sent an invitation or request how it was answered. */
export function queueOfferAnsweredEmails(
	transaction: Transaction,
	firestore: Firestore,
	{
		type,
		accepted,
		context,
	}: { type: OfferType; accepted: boolean; context: TeamOfferContext }
): void {
	const { playerId, playerName, teamName, seasonName, captainIds } = context
	if (type === OfferType.INVITATION) {
		for (const captainId of captainIds) {
			queueEmailInTransaction(transaction, firestore, {
				to: { playerId: captainId },
				template: accepted
					? 'teamInvitationAccepted'
					: 'teamInvitationDeclined',
				props: { teamName, playerName },
			})
		}
		return
	}
	queueEmailInTransaction(transaction, firestore, {
		to: { playerId },
		template: accepted ? 'teamRequestAccepted' : 'teamRequestDeclined',
		props: { teamName, seasonName },
	})
}

/**
 * Tells the other side that an offer they were sent was withdrawn: the
 * player, for an invitation; the captains, for a request. Nothing is sent
 * for an offer that was itself sent quietly (see above).
 */
export function queueOfferWithdrawnEmails(
	transaction: Transaction,
	firestore: Firestore,
	{
		type,
		sentQuietly,
		context,
	}: { type: OfferType; sentQuietly: boolean; context: TeamOfferContext }
): void {
	if (sentQuietly) return
	const { playerId, playerName, teamName, seasonName, captainIds } = context
	if (type === OfferType.INVITATION) {
		queueEmailInTransaction(transaction, firestore, {
			to: { playerId },
			template: 'teamInvitationWithdrawn',
			props: { teamName, seasonName },
		})
		return
	}
	for (const captainId of captainIds) {
		queueEmailInTransaction(transaction, firestore, {
			to: { playerId: captainId },
			template: 'teamRequestWithdrawn',
			props: { teamName, playerName },
		})
	}
}

/**
 * Tells the captains of a team whose offer to or from the player was
 * withdrawn because the player joined `joinedTeamName` instead. The player
 * is not told: they chose it.
 */
export function queuePlayerJoinedElsewhereEmails(
	transaction: Transaction,
	firestore: Firestore,
	{
		type,
		context,
		joinedTeamName,
	}: { type: OfferType; context: TeamOfferContext; joinedTeamName: string }
): void {
	const { playerName, teamName, captainIds } = context
	for (const captainId of captainIds) {
		queueEmailInTransaction(transaction, firestore, {
			to: { playerId: captainId },
			template: 'teamPlayerJoinedElsewhere',
			props: {
				teamName,
				playerName,
				joinedTeamName,
				offerType: type === OfferType.INVITATION ? 'invitation' : 'request',
			},
		})
	}
}
