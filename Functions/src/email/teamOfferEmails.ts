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
 * without end, yet a captain who withdraws by mistake and invites again
 * must not leave the player's last email saying "withdrawn". So a player and
 * a team get at most `OFFER_SEND_EMAILS_PER_DAY` "sent" emails a day for
 * each kind of offer, recorded on the offer as `sendEmailedAt`; one sent
 * past that goes out without an email and is marked `sentQuietly`, and a
 * withdrawal is emailed only when its offer's sending was.
 *
 * The emails are queued in the transaction that makes the change, so one
 * goes out only if the change was saved. A transaction reads before it
 * writes, so read the context with `readTeamOfferContext` before any write.
 */

import {
	Timestamp,
	type Firestore,
	type Query,
	type Transaction,
} from 'firebase-admin/firestore'
import {
	Collections,
	OfferType,
	PLAYER_SEASONS_SUBCOLLECTION,
	type OfferDocument,
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
import { DAY_MS } from '../shared/leagueCalendar.js'

/** How many "sent" emails a player and a team get a day, per kind of offer. */
export const OFFER_SEND_EMAILS_PER_DAY = 2

/**
 * Whether sending an offer emails the other side, and the times to record
 * as its `sendEmailedAt`. An offer between a player and a team reuses one
 * document, so `previous` is what that document held before: its sends of
 * the same kind in the last day count toward the limit.
 */
export function offerSendEmailPlan(
	previous: Pick<Partial<OfferDocument>, 'type' | 'sendEmailedAt'> | undefined,
	type: OfferType,
	now: Date
): { email: boolean; sendEmailedAt: Timestamp[] } {
	const recent =
		previous?.type === type
			? (previous.sendEmailedAt ?? []).filter(
					(at) => now.getTime() - at.toMillis() < DAY_MS
				)
			: []
	const email = recent.length < OFFER_SEND_EMAILS_PER_DAY
	return {
		email,
		sendEmailedAt: email ? [...recent, Timestamp.fromDate(now)] : recent,
	}
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
 * player, for an invitation; the captains, for a request. Call it only for
 * an offer whose sending was emailed (see above).
 */
export function queueOfferWithdrawnEmails(
	transaction: Transaction,
	firestore: Firestore,
	{ type, context }: { type: OfferType; context: TeamOfferContext }
): void {
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
