/**
 * Create a Stripe Checkout session for a contribution to the caller's team.
 *
 * Under team-level pricing a team registers once its roster has committed the
 * season's total, in any split. Each contribution is a card **authorization**
 * (`capture_method: 'manual'`), not a charge: a team that misses one of the
 * limited spots has its holds cancelled, which costs nothing, where a refund
 * would forfeit the processing fee. See docs/TEAM_PAYMENTS.md.
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
	committedByRosterCents,
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
 * Shown above the pay button. A hold looks like a charge on a statement, and
 * a $1,000 line nobody recognises becomes a dispute.
 */
const HOLD_EXPLANATION =
	`Your card is authorized now and charged when your team registers. ` +
	`An authorization lasts about a week, so if your team has not registered ` +
	`by then it is charged early rather than allowed to lapse. If your team ` +
	`does not get one of the ${TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK} spots, ` +
	`the authorization is released, or the charge refunded in full.`

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
		// Only the start is waived for admins. Their early money is held like
		// anyone's, so the hourly sweep captures it in its last day; an admin
		// testing releases it from Team Management > Payments before then.
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
		// who left is being released, and does not reduce anyone's share.
		const committed = committedByRosterCents(
			contributionsSnap.docs.map(
				(doc) => doc.data() as TeamContributionDocument
			),
			rosterPlayerIds
		)
		const remainingCents = teamTotalCents - committed
		if (remainingCents <= 0) {
			throw new HttpsError(
				'failed-precondition',
				'Your team has already committed the full amount'
			)
		}

		// Two teammates who both see $200 remaining can both pay it. That is
		// deliberate: the excess is a hold, and settlement captures only what
		// the team needs and releases the rest at no cost. Refusing here
		// would need a reservation system for a race that costs nothing.
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
				// Card only: every card network supports manual capture, and
				// the hold's expiry is read from the card details on the charge.
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
					capture_method: 'manual',
					description: `Team registration: ${teamSeason.name}, ${currentSeason.name}`,
					// Repeated on the PaymentIntent so capture, cancellation and
					// refund events can find their contribution without the
					// session.
					metadata,
				},
				metadata,
				custom_text: {
					submit: { message: HOLD_EXPLANATION },
				},
				expires_at:
					Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS,
				success_url: successUrl,
				cancel_url: cancelUrl,
			}

			// Same caller, team, amount and minute: a double-click or a retry
			// gets the same session back rather than a second hold.
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
