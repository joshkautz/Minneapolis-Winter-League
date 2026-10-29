/**
 * Team registration status management service
 *
 * Decides whether a team has met the season's registration requirements and,
 * if so, claims one of the season's limited spots for it.
 *
 * Two rules, chosen by whether the season sets
 * `teamRegistrationTotalCents`:
 *
 * - **Per-player** (the original): ten roster members each individually paid
 *   and signed.
 * - **Team-total**: ten roster members who have signed, plus that much money
 *   paid by people still on the roster, in any split. A player is registered by their
 *   waiver; the money belongs to the team.
 */

import {
	getFirestore,
	FieldValue,
	type Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	canRegisterAt,
	type RegistrationTrigger,
} from '../shared/registrationWindow.js'
import {
	Collections,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamContributionDocument,
	type TeamSeasonDocument,
	ROSTER_SUBCOLLECTION,
} from '../types.js'
import {
	paidByRosterCents,
	teamContributionsCollection,
} from '../shared/contributions.js'
import { playerSeasonRef, teamSeasonRef } from '../shared/database.js'
import {
	hasOpenSpot,
	MIN_SIGNED_PLAYERS,
	REGISTRATION_SPOTS,
} from '../shared/teamPaymentRules.js'

/**
 * Whether a player counts toward their team's ten, under whichever rule the
 * season uses. The one definition, so the registration check and the check
 * that a departure would not break a registered team cannot disagree — they
 * did, and under team-total pricing nobody on a registered team could leave.
 *
 * Checked by type rather than presence, so a total cleared to null falls
 * back to the per-player rule instead of a $0 team total.
 */
export function countsTowardRegistration(
	playerSeason: Pick<PlayerSeasonDocument, 'paid' | 'signed'> | undefined,
	season: Pick<SeasonDocument, 'teamRegistrationTotalCents'> | undefined
): boolean {
	if (!playerSeason?.signed) return false
	// Under team-total pricing the money is the team's; a player qualifies by
	// signing. Per-player pricing also needs their own payment.
	return typeof season?.teamRegistrationTotalCents === 'number'
		? true
		: Boolean(playerSeason.paid)
}

/**
 * Recompute the registration status of a team for a specific season.
 *
 * Registration is a **race for a limited number of spots**, so the whole
 * decision happens in one transaction: count the qualifying roster members,
 * check the season still has room, claim a spot and set the flag. Doing it in
 * separate steps allows two teams to both see eleven taken and both become
 * the twelfth.
 *
 * The count of claimed spots lives on the season document as
 * `registeredTeamCount`, which is what makes the check atomic — a
 * collection-group count of registered teams cannot be read consistently
 * inside a transaction, and reading it outside one is the bug.
 *
 * **Registration is irreversible.** A team that has claimed a spot keeps it
 * for the season even if its roster later falls below the threshold; the spot
 * is gone either way, and under team-level payment there is money attached to
 * it. Reversing a registration is an administrative act that has to settle
 * that money, not something this function does as a side effect of someone
 * leaving a roster.
 */
export async function updateTeamRegistrationStatus(
	teamId: string,
	seasonId: string,
	options: {
		/** What changed: a new payment may complete a team just after the close. */
		trigger?: RegistrationTrigger
		now?: Date
		/**
		 * Set only by `releaseHeldSpots`, giving waiting teams their turn
		 * before the holds are recorded as over (see `claimSpotIfQualified`).
		 */
		releasingHeldSpots?: boolean
	} = {}
): Promise<ClaimOutcome> {
	const firestore = getFirestore()

	try {
		const result = await claimSpotIfQualified(firestore, teamId, seasonId, {
			trigger: options.trigger ?? 'other',
			now: options.now ?? new Date(),
			releasingHeldSpots: options.releasingHeldSpots ?? false,
		})

		if (result.outcome === 'registration-closed') {
			logger.info('Team qualified after registration closed', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
			})
			return result
		}

		if (result.outcome === 'registered') {
			logger.info('Team registered', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				spotsClaimed: result.spotsClaimed,
			})
			return result
		}

		if (result.outcome === 'underfunded') {
			logger.info('Team has its players but not yet the money', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				paidCents: result.paidCents,
				requiredCents: result.requiredCents,
			})
			return result
		}

		if (result.outcome === 'waiting-for-held-spot') {
			logger.info('Team qualified; the spots left are held', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				spotsClaimed: result.spotsClaimed,
				spotsHeldForOthers: result.spotsHeldForOthers,
			})
			return result
		}

		if (result.outcome === 'season-full') {
			logger.info('Team qualified but the season is full', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				spotsClaimed: result.spotsClaimed,
			})
		}
		return result
	} catch (error) {
		logger.error('Error updating team registration status:', {
			teamId,
			seasonId,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}

export type ClaimOutcome =
	| { outcome: 'registered'; qualifyingPlayers: number; spotsClaimed: number }
	| { outcome: 'season-full'; qualifyingPlayers: number; spotsClaimed: number }
	| {
			outcome: 'waiting-for-held-spot'
			qualifyingPlayers: number
			spotsClaimed: number
			spotsHeldForOthers: number
	  }
	| { outcome: 'not-qualified'; qualifyingPlayers: number }
	| {
			outcome: 'underfunded'
			qualifyingPlayers: number
			paidCents: number
			requiredCents: number
	  }
	| { outcome: 'registration-closed'; qualifyingPlayers: number }
	| { outcome: 'already-registered' }
	| { outcome: 'no-team-season' }

/**
 * The transaction itself, separated so its outcomes can be asserted directly.
 *
 * **Held spots.** While a season's held spots stand (`heldSpotTeamIds`,
 * until `heldSpotsReleasedAt` is set), a spot is held for each of last
 * season's top three that has not registered yet, and no other team can
 * take it. A team that qualifies when only held spots are left waits
 * instead: the time is recorded on its team-season, and when the holds
 * end, `releaseHeldSpots` registers the waiting teams in that order, with
 * `releasingHeldSpots` set. Holds end when that has happened, not at
 * `heldSpotsEndMs` itself, so a team qualifying in between queues behind
 * the teams already waiting instead of jumping ahead of them.
 */
async function claimSpotIfQualified(
	firestore: Firestore,
	teamId: string,
	seasonId: string,
	{
		trigger,
		now,
		releasingHeldSpots,
	}: { trigger: RegistrationTrigger; now: Date; releasingHeldSpots: boolean }
): Promise<ClaimOutcome> {
	const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
	const seasonDocRef = firestore.collection(Collections.SEASONS).doc(seasonId)

	return firestore.runTransaction(async (transaction) => {
		// ---- Reads. Firestore requires all of them before any write. ----
		const teamSeasonSnap = await transaction.get(teamSeasonDocRef)
		if (!teamSeasonSnap.exists) {
			logger.warn(
				`Team season not found: teams/${teamId}/teamSeasons/${seasonId}`
			)
			return { outcome: 'no-team-season' }
		}

		// A claimed spot is never given back, so there is nothing to recompute.
		const teamSeason = teamSeasonSnap.data() as TeamSeasonDocument
		if (teamSeason.registered === true) {
			return { outcome: 'already-registered' }
		}

		// The season decides which rule applies, so it is read before the
		// roster rather than after.
		const seasonSnap = await transaction.get(seasonDocRef)
		const seasonData = seasonSnap.data() as SeasonDocument | undefined
		// Checked by type rather than presence, so a field cleared to null
		// falls back to the per-player rule instead of a $0 team total.
		const teamTotalCents =
			typeof seasonData?.teamRegistrationTotalCents === 'number'
				? seasonData.teamRegistrationTotalCents
				: undefined

		// The held teams' own entries this season, to count the holds still
		// standing; a held team that has registered no longer holds anything.
		const holdsStand = !releasingHeldSpots && !seasonData?.heldSpotsReleasedAt
		const heldForOthers = holdsStand
			? (seasonData?.heldSpotTeamIds ?? []).filter((id) => id !== teamId)
			: []
		const heldTeamSeasons = await Promise.all(
			heldForOthers.map((id) =>
				transaction.get(teamSeasonRef(firestore, id, seasonId))
			)
		)
		const spotsHeldForOthers = heldTeamSeasons.filter(
			(snap) => snap.data()?.registered !== true
		).length

		const rosterSnap = await transaction.get(
			teamSeasonDocRef.collection(ROSTER_SUBCOLLECTION)
		)
		const playerSeasons = await Promise.all(
			rosterSnap.docs.map((rosterDoc) =>
				transaction.get(playerSeasonRef(firestore, rosterDoc.id, seasonId))
			)
		)

		// Under team-total pricing a player qualifies by signing their waiver.
		// Payment is the team's business, not theirs: one person can cover the
		// whole roster, which would leave everyone else unpaid and the team
		// permanently unable to register under the original rule.
		const qualifyingPlayers = playerSeasons.filter(
			(snap) =>
				snap.exists &&
				countsTowardRegistration(
					snap.data() as PlayerSeasonDocument | undefined,
					seasonData
				)
		).length

		// A team waiting for a held spot that stops qualifying leaves the
		// queue: should it qualify again, it waits from then. So a team still
		// waiting has qualified without a break since a time registration
		// was open.
		const leaveQueue = (): void => {
			if (teamSeason.waitingForSpotSince) {
				transaction.update(teamSeasonDocRef, { waitingForSpotSince: null })
			}
		}

		if (qualifyingPlayers < MIN_SIGNED_PLAYERS) {
			leaveQueue()
			return { outcome: 'not-qualified', qualifyingPlayers }
		}

		if (teamTotalCents !== undefined) {
			const contributionsSnap = await transaction.get(
				teamContributionsCollection(firestore, teamId, seasonId)
			)
			// Only the money of people still on the team counts.
			const paid = paidByRosterCents(
				contributionsSnap.docs.map(
					(doc) => doc.data() as TeamContributionDocument
				),
				new Set(rosterSnap.docs.map((doc) => doc.id))
			)

			if (paid < teamTotalCents) {
				leaveQueue()
				return {
					outcome: 'underfunded',
					qualifyingPlayers,
					paidCents: paid,
					requiredCents: teamTotalCents,
				}
			}
		}

		// Registration closes when the season says, for a team-payment season:
		// a late waiver or roster change cannot register a team, and a late
		// payment only within the grace a checkout opened in time needs.
		// Earlier seasons, on per-player pricing, stay open to admin fixes.
		// A team waiting for a held spot qualified while it could register
		// (see leaveQueue), so it is given its turn even if the holds outlast
		// registration, or it qualified on a payment in the late grace.
		const waitedInTime =
			releasingHeldSpots && Boolean(teamSeason.waitingForSpotSince)
		if (
			teamTotalCents !== undefined &&
			seasonData &&
			!waitedInTime &&
			!canRegisterAt(seasonData, now, trigger)
		) {
			return { outcome: 'registration-closed', qualifyingPlayers }
		}

		// Absent on a season created before the counter existed (#1404); every
		// season since starts at zero, and the old ones were backfilled.
		const spotsClaimed = seasonData?.registeredTeamCount ?? 0

		if (spotsClaimed >= REGISTRATION_SPOTS) {
			return { outcome: 'season-full', qualifyingPlayers, spotsClaimed }
		}

		if (!hasOpenSpot({ spotsClaimed, spotsHeldForOthers })) {
			// Its place in the queue is when it first qualified.
			if (!teamSeason.waitingForSpotSince) {
				transaction.update(teamSeasonDocRef, {
					waitingForSpotSince: FieldValue.serverTimestamp(),
				})
			}
			return {
				outcome: 'waiting-for-held-spot',
				qualifyingPlayers,
				spotsClaimed,
				spotsHeldForOthers,
			}
		}

		// ---- Writes. ----
		transaction.update(seasonDocRef, {
			registeredTeamCount: FieldValue.increment(1),
		})
		transaction.update(teamSeasonDocRef, {
			registered: true,
			registeredDate: FieldValue.serverTimestamp(),
		})

		return {
			outcome: 'registered',
			qualifyingPlayers,
			spotsClaimed: spotsClaimed + 1,
		}
	})
}
