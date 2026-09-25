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
 * - Return URLs must be on one of the league's own origins
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
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

/** Checkout groups idempotency keys into windows of this length. */
const IDEMPOTENCY_WINDOW_MS = 60_000

const CURRENCY = 'usd'

/**
 * Shown above the pay button, so a payer knows before paying when they get
 * their money back. The same wording is on the team payment card in the App.
 */
const PAYMENT_EXPLANATION =
	`Your card is charged now. If you leave the team before it registers, or ` +
	`it does not get one of the ${TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK} ` +
	`spots, you are refunded in full. If your team pays more than its total, ` +
	`the extra is refunded, latest payments first. Refunds take 5 to 10 ` +
	`business days to reach your card.`

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

		// Two teammates who both see $200 remaining can both pay it, and the
		// later payment is refunded, at the cost of its processing fee.
		// Refusing it here would need a reservation system, held for as long
		// as a Checkout session stays open, to save a fee on a rare race.
		const amountError = contributionAmountError(amountCents, remainingCents)
		if (amountError) {
			throw new HttpsError('invalid-argument', amountError)
		}
		// contributionAmountError has established this.
		const validAmountCents = amountCents as number

		try {
			const stripe = createStripeClient()

			const [customer] = await Promise.all([
				getOrCreateStripeCustomer(firestore, stripe, {
					userId,
					email: userRecord.email,
				}),
				ensureTeamRegistrationProduct(stripe),
			])

			// Everything the webhook needs to attribute the money. It is set
			// here, by the server, and the webhook trusts nothing else.
			const metadata = {
				kind: TEAM_CONTRIBUTION_KIND,
				firebaseUID: userId,
				teamId,
				seasonId,
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
				expires_at:
					Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS,
				success_url: successUrl,
				cancel_url: cancelUrl,
			}

			// Same caller, team, amount and minute: a double-click or a retry
			// gets the same session back rather than a second payment.
			const timeWindow = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)
			const idempotencyKey = `team_contribution_${userId}_${teamId}_${seasonId}_${validAmountCents}_${timeWindow}`

			const stripeSession = await stripe.checkout.sessions.create(
				sessionParams,
				{ idempotencyKey }
			)

			if (!stripeSession.url) {
				throw new HttpsError('internal', 'Failed to create checkout URL')
			}

			logger.info('Created team contribution checkout session', {
				userId,
				teamId,
				seasonId,
				amountCents: validAmountCents,
				remainingCents,
				sessionId: stripeSession.id,
			})

			return {
				success: true,
				url: stripeSession.url,
				sessionId: stripeSession.id,
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			logger.error('Error creating team contribution checkout session:', {
				userId,
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError('internal', 'Failed to create checkout session')
		}
	}
)
