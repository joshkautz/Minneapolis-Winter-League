/**
 * Create a Stripe Checkout session for a contribution to the caller's team.
 *
 * Under team-level pricing a team registers once its roster has paid the
 * season's total, in any split. Each contribution is charged when the payer
 * completes Checkout; a team that misses one of the limited spots, a payer
 * who leaves before the team registers, and any money beyond the total are
 * refunded, and the league bears the processing fee. A card hold would have
 * avoided the fee, but lasts only a week on most cards, against a month of
 * registration. See docs/TEAM_PAYMENTS.md.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned
 * - The current season must use team-level pricing
 * - Registration must be open. An admin may contribute before it opens, so
 *   the flow can be tried with a real card ahead of opening day; nobody may
 *   after it closes, because money that arrives then has nowhere to go but
 *   back
 * - The team is the caller's own for the current season, read from their
 *   player-season and confirmed against the roster; the client cannot name
 *   a team
 * - The team must not already be registered, and the season must have a spot
 *   left
 * - The amount is checked against the team's live remaining balance, with a
 *   floor; the client proposes, the server decides
 * - The amount is reserved while the payer is on Stripe's page, and what
 *   teammates have reserved is not available: two people can never pay the
 *   same dollars, so a team cannot pay more than its total. See
 *   services/teamCheckoutReservations.ts
 * - Return URLs must be on one of the league's own origins
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../../../config/constants.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import {
	getCurrentSeason,
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import {
	CENTS_PER_DOLLAR,
	formatDollars,
	paidByRosterCents,
	contributionAmountError,
	teamContributionsCollection,
} from '../../../shared/contributions.js'
import { isAllowedReturnUrl } from '../../../shared/returnUrls.js'
import {
	createStripeClient,
	ensureTeamRegistrationProduct,
	getOrCreateStripeCustomer,
	TEAM_CONTRIBUTION_KIND,
	TEAM_REGISTRATION_PRODUCT_ID,
} from '../../../shared/stripe.js'
import { formatDateForUser } from '../../../shared/format.js'
import { removeReservation } from '../../../shared/checkoutReservations.js'
import {
	attachSession,
	closeOpenCheckouts,
	reserveContribution,
	resolveExpiredReservations,
} from '../../../services/teamCheckoutReservations.js'
import {
	Collections,
	type PlayerDocument,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamContributionDocument,
	type TeamSeasonDocument,
} from '../../../types.js'
import type Stripe from 'stripe'

interface CreateTeamContributionCheckoutRequest {
	/** Proposed contribution, in cents. Validated against the live balance. */
	amountCents: number
	successUrl: string
	cancelUrl: string
	timezone?: string
}

interface CreateTeamContributionCheckoutResponse {
	success: true
	url: string
	sessionId: string
}

/**
 * How long a Checkout session stays open. Kept as short as Stripe allows,
 * because the balance a contribution was validated against goes stale while
 * the session is open.
 *
 * Stripe's floor is thirty minutes, measured against its own clock. The
 * extra minute keeps a few seconds of drift in ours from putting the value
 * under the floor, which would fail every checkout outright.
 */
const CHECKOUT_SESSION_LIFETIME_SECONDS = 31 * 60

/**
 * How much longer than its session a reservation lasts before the session
 * exists. Only matters if creating the session fails in a way that leaves the
 * reservation behind; once the session exists, its own expiry is used.
 */
const RESERVATION_MARGIN_SECONDS = 60

const CURRENCY = 'usd'

/**
 * Shown above the pay button, so a payer knows before paying when they get
 * their money back. The same wording is on the team payment card in the App.
 */
const PAYMENT_EXPLANATION =
	`Your card is charged now. If you leave the team before it registers, or ` +
	`it does not get one of the ${TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK} ` +
	`spots, you are refunded in full. Refunds take 5 to 10 business days to ` +
	`reach your card.`

type CheckoutSessionCreateParams = Parameters<
	Stripe['checkout']['sessions']['create']
>[0]

export const createTeamContributionCheckout = onCall<
	CreateTeamContributionCheckoutRequest,
	Promise<CreateTeamContributionCheckoutResponse>
>(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (request) => {
		const { auth, data } = request

		validateAuthentication(auth)
		const userId = auth.uid

		const { amountCents, successUrl, cancelUrl, timezone } = data ?? {}

		if (!isAllowedReturnUrl(successUrl) || !isAllowedReturnUrl(cancelUrl)) {
			throw new HttpsError(
				'invalid-argument',
				'Success and cancel URLs must point back to this site'
			)
		}

		const firestore = getFirestore()

		await validateNotBanned(firestore, userId)

		const isAdmin =
			(
				(
					await firestore.collection(Collections.PLAYERS).doc(userId).get()
				).data() as PlayerDocument | undefined
			)?.admin === true

		const currentSeason = (await getCurrentSeason()) as
			(SeasonDocument & { id: string }) | null
		if (!currentSeason) {
			throw new HttpsError('failed-precondition', 'No current season found')
		}
		const seasonId = currentSeason.id

		// Checked by type rather than presence: a cleared field written as
		// null must not read as a team total of nothing.
		const teamTotalCents = currentSeason.teamRegistrationTotalCents
		if (typeof teamTotalCents !== 'number') {
			throw new HttpsError(
				'failed-precondition',
				'This season does not use team payments'
			)
		}
		// Contributions are whole dollars, so a total that is not would leave
		// every team owing a remainder nobody is allowed to pay.
		if (
			!Number.isSafeInteger(teamTotalCents) ||
			teamTotalCents <= 0 ||
			teamTotalCents % CENTS_PER_DOLLAR !== 0
		) {
			logger.error('Season team registration total is misconfigured', {
				seasonId,
				teamTotalCents,
			})
			throw new HttpsError(
				'failed-precondition',
				'Team payments are not set up correctly for this season'
			)
		}

		const now = new Date()
		const registrationStart = currentSeason.registrationStart.toDate()
		const registrationEnd = currentSeason.registrationEnd.toDate()
		// Only the start is waived for admins. Their early money is an ordinary
		// payment; an admin testing refunds it from Team Management > Payments.
		if (now < registrationStart && !isAdmin) {
			throw new HttpsError(
				'failed-precondition',
				`Registration has not opened yet. Registration opens ${formatDateForUser(registrationStart, timezone)}.`
			)
		}
		if (now > registrationEnd) {
			throw new HttpsError(
				'failed-precondition',
				`Registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
			)
		}

		if (
			(currentSeason.registeredTeamCount ?? 0) >=
			TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
		) {
			throw new HttpsError(
				'failed-precondition',
				'Every spot this season has been taken'
			)
		}

		// The team comes from the caller's own season record, never from the
		// request, so nobody can put money on a team they are not on.
		const playerSeasonSnap = await playerSeasonRef(
			firestore,
			userId,
			seasonId
		).get()
		const teamRef = (
			playerSeasonSnap.data() as PlayerSeasonDocument | undefined
		)?.team
		if (!teamRef) {
			throw new HttpsError(
				'failed-precondition',
				'You must be on a team to contribute to one'
			)
		}
		const teamId = teamRef.id

		const [rosterSnap, teamSeasonSnap, contributionsSnap, userRecord] =
			await Promise.all([
				teamSeasonRef(firestore, teamId, seasonId).collection('roster').get(),
				teamSeasonRef(firestore, teamId, seasonId).get(),
				teamContributionsCollection(firestore, teamId, seasonId).get(),
				getAuth().getUser(userId),
			])
		// Roster entries are keyed by player id.
		const rosterPlayerIds = new Set(rosterSnap.docs.map((doc) => doc.id))

		// Both sides of the membership are written together, so disagreement
		// means something is wrong; refuse rather than guess which is right.
		if (!rosterPlayerIds.has(userId) || !teamSeasonSnap.exists) {
			throw new HttpsError(
				'failed-precondition',
				'You must be on a team to contribute to one'
			)
		}

		const teamSeason = teamSeasonSnap.data() as TeamSeasonDocument
		if (teamSeason.registered === true) {
			throw new HttpsError(
				'failed-precondition',
				'Your team is already registered'
			)
		}

		// What the team still needs, from the people on it now. A teammate
		// who left is being refunded, and does not reduce anyone's share.
		const paid = paidByRosterCents(
			contributionsSnap.docs.map(
				(doc) => doc.data() as TeamContributionDocument
			),
			rosterPlayerIds
		)
		const remainingCents = teamTotalCents - paid
		if (remainingCents <= 0) {
			throw new HttpsError(
				'failed-precondition',
				'Your team has already paid the full amount'
			)
		}

		// A first check against what has been paid, so an amount that could
		// never be accepted is refused before Stripe is involved. What
		// teammates are paying right now is taken off below, atomically.
		const amountError = contributionAmountError(amountCents, remainingCents)
		if (amountError) {
			throw new HttpsError('invalid-argument', amountError)
		}
		// contributionAmountError has established this.
		const validAmountCents = amountCents as number

		const stripe = createStripeClient()
		let reservationId: string | undefined
		try {
			// This payer's earlier checkout, if they opened one and came back
			// some other way than Stripe's cancel link, is closed first: one
			// open checkout per payer. Then any teammate's that has run out
			// of time is settled against Stripe, so it stops blocking.
			await closeOpenCheckouts(firestore, stripe, {
				teamId,
				seasonId,
				playerId: userId,
			})
			await resolveExpiredReservations(firestore, stripe, { teamId, seasonId })

			const sessionExpiresAtSeconds =
				Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS
			const reserved = await reserveContribution(firestore, {
				teamId,
				seasonId,
				playerId: userId,
				rosterPlayerIds,
				totalCents: teamTotalCents,
				amountCents: validAmountCents,
				// Until the session exists; replaced by its own expiry below.
				expiresAt: Timestamp.fromMillis(
					(sessionExpiresAtSeconds + RESERVATION_MARGIN_SECONDS) * 1000
				),
				validate: contributionAmountError,
			})
			if (reserved.outcome === 'invalid') {
				throw new HttpsError('invalid-argument', reserved.reason)
			}
			if (reserved.outcome === 'too-much') {
				throw tooMuchError(reserved)
			}
			reservationId = reserved.reservationId

			const [customer] = await Promise.all([
				getOrCreateStripeCustomer(firestore, stripe, {
					userId,
					email: userRecord.email,
				}),
				ensureTeamRegistrationProduct(stripe),
			])

			// Everything the webhook needs to attribute the money and end the
			// reservation. It is set here, by the server, and the webhook
			// trusts nothing else.
			const metadata = {
				kind: TEAM_CONTRIBUTION_KIND,
				firebaseUID: userId,
				teamId,
				seasonId,
				reservationId,
			}

			const sessionParams: CheckoutSessionCreateParams = {
				customer,
				mode: 'payment',
				// Card only, wallets included: a card payment succeeds when
				// Checkout completes, so the contribution is paid the moment it
				// is recorded. Bank debits would take days to settle.
				payment_method_types: ['card'],
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency: CURRENCY,
							unit_amount: validAmountCents,
							product: TEAM_REGISTRATION_PRODUCT_ID,
						},
					},
				],
				payment_intent_data: {
					description: `Team registration: ${teamSeason.name}, ${currentSeason.name}`,
					// Repeated on the PaymentIntent so refund events, and the
					// reconciliation's search, can find their contribution
					// without the session.
					metadata,
				},
				metadata,
				custom_text: {
					submit: { message: PAYMENT_EXPLANATION },
				},
				expires_at: sessionExpiresAtSeconds,
				success_url: successUrl,
				cancel_url: cancelUrl,
			}

			// One session per reservation: a retry of this request gets the
			// same session back rather than a second one.
			const stripeSession = await stripe.checkout.sessions.create(
				sessionParams,
				{ idempotencyKey: `team_contribution_${reservationId}` }
			)

			if (!stripeSession.url) {
				throw new HttpsError(
					'internal',
					'Checkout could not be opened. Please try again.'
				)
			}

			const attached = await attachSession(firestore, {
				teamId,
				seasonId,
				reservationId,
				sessionId: stripeSession.id,
				expiresAt: Timestamp.fromMillis(sessionExpiresAtSeconds * 1000),
			})
			if (!attached) {
				// The same payer opened another checkout meanwhile — a double
				// click — which ended this one's reservation. Nobody may pay
				// against a session nothing is reserved for.
				await stripe.checkout.sessions.expire(stripeSession.id)
				throw new HttpsError(
					'aborted',
					'You opened another payment at the same time. Use that one.'
				)
			}

			logger.info('Created team contribution checkout session', {
				userId,
				teamId,
				seasonId,
				amountCents: validAmountCents,
				reservationId,
				sessionId: stripeSession.id,
			})

			return {
				success: true,
				url: stripeSession.url,
				sessionId: stripeSession.id,
			}
		} catch (error) {
			// A reservation whose checkout never opened would block the team
			// until it expired.
			if (reservationId) {
				await removeReservation(firestore, {
					teamId,
					seasonId,
					reservationId,
				}).catch((cleanupError: unknown) =>
					logger.error('Could not remove an unused reservation', {
						teamId,
						seasonId,
						reservationId,
						error:
							cleanupError instanceof Error
								? cleanupError.message
								: String(cleanupError),
					})
				)
			}

			if (error instanceof HttpsError) {
				throw error
			}

			logger.error('Error creating team contribution checkout session:', {
				userId,
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError(
				'internal',
				'Checkout could not be opened. Please try again.'
			)
		}
	}
)

/**
 * Why a contribution was refused once teammates' open checkouts were taken
 * off, in words the payer can act on.
 */
function tooMuchError(result: {
	availableCents: number
	reservedByOthersCents: number
}): HttpsError {
	const { availableCents, reservedByOthersCents } = result
	if (availableCents > 0 && reservedByOthersCents === 0) {
		// A teammate's payment landed while this request was deciding.
		return new HttpsError(
			'invalid-argument',
			`Your team only needs ${formatDollars(availableCents)} more.`
		)
	}
	if (availableCents > 0) {
		return new HttpsError(
			'invalid-argument',
			`Your team only needs ${formatDollars(availableCents)} more while a ` +
				`teammate finishes paying ${formatDollars(reservedByOthersCents)}.`
		)
	}
	if (reservedByOthersCents > 0) {
		return new HttpsError(
			'failed-precondition',
			'A teammate is paying the rest of your team’s total right now. If ' +
				'they do not finish, it frees up within 30 minutes.'
		)
	}
	return new HttpsError(
		'failed-precondition',
		'Your team has already paid the full amount'
	)
}
