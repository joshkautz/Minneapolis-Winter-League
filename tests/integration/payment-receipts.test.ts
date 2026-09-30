import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import {
	addPayment,
	failNext,
	fakeStripe,
	resetFakeStripe,
} from './fake-stripe.js'
import { fakeResend, setEmailMode } from './email-helpers.js'
import {
	recordContribution,
	setContributionStatus,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import {
	playerContactRef,
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { recordContributionFromStripe } from '../../Functions/src/services/teamContributionIntake.js'
import {
	refundContribution,
	settleTeamSeason,
} from '../../Functions/src/services/teamSettlement.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'

/**
 * Receipts for team payments and refunds, sent by the league instead of
 * Stripe. Each ledger change is run through the real trigger, with the
 * contribution as the ledger really holds it, against a Stripe that keeps
 * state.
 */

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

const TOTAL = 100_000
const SEASON = 'season-1'
const TEAM = 'team-1'
const PAYER = 'payer'

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const contributionRef = (paymentIntentId: string) =>
	teamContributionsCollection(firestore, TEAM, SEASON).doc(paymentIntentId)

const onRoster = async (playerId: string, signed: boolean) => {
	await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
		player: firestore.collection('players').doc(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, SEASON).set({
		season: seasonRef(),
		team: firestore.collection('teams').doc(TEAM),
		captain: false,
		paid: false,
		signed,
	} as never)
}

/** Runs the trigger for a ledger write, as Firestore would. */
const fire = async (
	paymentIntentId: string,
	before: Record<string, unknown> | undefined,
	after: Record<string, unknown> | undefined
) => {
	const snap = (data: Record<string, unknown> | undefined) => ({
		exists: data !== undefined,
		data: () => data,
	})
	await manifest.emailContributionReceipt.run({
		id: `evt-${Math.random()}`,
		params: { teamId: TEAM, seasonId: SEASON, paymentIntentId },
		data: { before: snap(before), after: snap(after) },
	})
}

const current = async (paymentIntentId: string) =>
	(await contributionRef(paymentIntentId).get()).data()

/** A payment in Stripe and in the ledger, and its trigger run. */
const pay = async (paymentIntentId: string, amountCents: number) => {
	addPayment(paymentIntentId, amountCents, {
		kind: 'team_contribution',
		firebaseUID: PAYER,
		teamId: TEAM,
		seasonId: SEASON,
	})
	await recordContribution(firestore, {
		teamId: TEAM,
		seasonId: SEASON,
		playerId: PAYER,
		paymentIntentId,
		amountCents,
	})
	await fire(paymentIntentId, undefined, await current(paymentIntentId))
}

/** A change to a contribution, and its trigger run. */
const change = async (
	paymentIntentId: string,
	status: 'paid' | 'refunded',
	amountCents?: number
) => {
	const before = await current(paymentIntentId)
	await setContributionStatus(firestore, {
		teamId: TEAM,
		seasonId: SEASON,
		paymentIntentId,
		status,
		amountCents,
	})
	await fire(paymentIntentId, before, await current(paymentIntentId))
}

interface Mail {
	id: string
	toPlayerId: string
	template: string
	category: string
	props: Record<string, unknown>
}

const outbox = async (): Promise<Mail[]> =>
	(await firestore.collection('mail').get()).docs.map(
		(doc) => ({ id: doc.id, ...doc.data() }) as Mail
	)

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	resetFakeStripe()
	await seasonRef().set({
		name: '2026 Fall',
		dateStart: Timestamp.now(),
		registrationStart: Timestamp.now(),
		registrationEnd: Timestamp.fromMillis(Date.now() + 864e6),
		registeredTeamCount: 0,
		teamRegistrationTotalCents: TOTAL,
	})
	await firestore.collection('teams').doc(TEAM).set({ teamId: TEAM })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Chao World',
		logo: null,
		storagePath: null,
		placement: null,
		registered: false,
		registeredDate: null,
	} as never)
	await firestore
		.collection('players')
		.doc(PAYER)
		.set({ firstname: 'Josh', lastname: 'Kautz', admin: false, banned: false })
	await playerContactRef(firestore, PAYER).set({ email: 'josh@example.com' })
	await onRoster(PAYER, true)
	await onRoster('teammate-1', true)
	await onRoster('teammate-2', false)
})

describe('a payment', () => {
	it('sends the payer a receipt with the payment and where the team stands', async () => {
		await pay('pi_1', 1_000)

		const mail = await outbox()
		expect(mail).toHaveLength(1)
		expect(mail[0]).toMatchObject({
			id: 'receipt-pi_1',
			toPlayerId: PAYER,
			template: 'teamPaymentReceipt',
			category: 'account',
			props: {
				teamName: 'Chao World',
				seasonName: '2026 Fall',
				amount: '$10.00',
				paymentMethod: 'Visa •••• 4242',
				receiptUrl: 'https://pay.stripe.com/receipts/pi_1',
				standing: {
					paid: '$10.00',
					fee: '$1,000.00',
					remaining: '$990.00',
					signedPlayers: 2,
					signedPlayersNeeded: 10,
				},
			},
		})
	})

	it('counts every payment toward the team, not just this one', async () => {
		await pay('pi_1', 40_000)
		await pay('pi_2', 60_000)

		const second = (await outbox()).find((m) => m.id === 'receipt-pi_2')
		expect(second?.props.amount).toBe('$600.00')
		expect(second?.props.standing).toMatchObject({
			paid: '$1,000.00',
			remaining: '$0.00',
		})
	})

	it('sends one receipt however often the trigger runs', async () => {
		await pay('pi_1', 1_000)

		await fire('pi_1', undefined, await current('pi_1'))
		await fire('pi_1', undefined, await current('pi_1'))

		expect(await outbox()).toHaveLength(1)
	})

	it('is retried when Stripe cannot be reached, and sends nothing until it can', async () => {
		addPayment('pi_1', 1_000, {})
		await recordContribution(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			playerId: PAYER,
			paymentIntentId: 'pi_1',
			amountCents: 1_000,
		})
		failNext('retrieve', 'pi_1', 'Stripe is down')

		await expect(
			fire('pi_1', undefined, await current('pi_1'))
		).rejects.toThrow()
		expect(await outbox()).toHaveLength(0)

		await fire('pi_1', undefined, await current('pi_1'))
		expect(await outbox()).toHaveLength(1)
	})

	it('reaches the payer as an account email, with no unsubscribe link', async () => {
		await setEmailMode(firestore, 'live')
		await pay('pi_1', 1_000)
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, 'receipt-pi_1', resend)).toBe(
			'sent'
		)

		const { email } = resend.sent[0]
		expect(email.to).toBe('josh@example.com')
		expect(email.subject).toBe('Receipt: $10.00 toward Chao World')
		expect(email.text).toContain('Hi Josh,')
		expect(email.text).toContain('$10.00 of the $1,000.00 team fee is paid')
		expect(email.text).toContain('https://pay.stripe.com/receipts/pi_1')
		expect(email.headers).toEqual({})
	})
})

describe('a refund', () => {
	it('sends a refund receipt when a payment is refunded whole', async () => {
		await pay('pi_1', 1_000)

		await change('pi_1', 'refunded')

		const refund = (await outbox()).find(
			(m) => m.template === 'teamRefundReceipt'
		)
		expect(refund).toMatchObject({
			toPlayerId: PAYER,
			category: 'account',
			props: {
				teamName: 'Chao World',
				amount: '$10.00',
				originallyPaid: '$10.00',
				fullRefund: true,
				standing: { paid: '$0.00', remaining: '$1,000.00' },
			},
		})
	})

	it('receipts each partial refund for what it gave back', async () => {
		await pay('pi_1', 50_000)

		await change('pi_1', 'paid', 30_000)
		await change('pi_1', 'refunded', 50_000)

		const refunds = (await outbox())
			.filter((m) => m.template === 'teamRefundReceipt')
			.map((m) => [m.props.amount, m.props.originallyPaid, m.props.fullRefund])
		expect(refunds).toEqual(
			expect.arrayContaining([
				['$200.00', '$500.00', false],
				['$300.00', '$500.00', false],
			])
		)
		expect(refunds).toHaveLength(2)
	})

	it('sends nothing for a change that moves no money', async () => {
		await pay('pi_1', 1_000)
		const before = await current('pi_1')

		await contributionRef('pi_1').update({ note: 'checked' })
		await fire('pi_1', before, await current('pi_1'))

		expect(await outbox()).toHaveLength(1)
	})

	it('still names the team in a refund receipt after the team is deleted', async () => {
		// A team that missed out is deleted once refunded; the name is also
		// on the payment our checkout created.
		await pay('pi_1', 1_000)
		const intent = fakeStripe.intents.get('pi_1')
		if (intent) intent.description = 'Team registration: Chao World, 2026 Fall'
		const before = await current('pi_1')
		await teamSeasonRef(firestore, TEAM, SEASON).delete()

		await fire('pi_1', before, {
			...before,
			status: 'refunded',
			refundCause: 'season-full',
		})

		expect(
			(await outbox()).find((m) => m.template === 'teamRefundReceipt')?.props
		).toMatchObject({
			teamName: 'Chao World',
			cause: 'season-full',
			amount: '$10.00',
			standing: null,
		})
	})
})

describe('a payment with no team to credit', () => {
	it('is refunded, and the payer told so', async () => {
		// The team was deleted while the payer was on the Checkout page.
		const paymentIntent = addPayment('pi_orphan', 2_500, {
			kind: 'team_contribution',
			firebaseUID: PAYER,
			teamId: 'deleted-team',
			seasonId: SEASON,
		})
		const { FakeStripe } = await import('./fake-stripe.js')

		const outcome = await recordContributionFromStripe(
			firestore,
			new FakeStripe() as never,
			{
				paymentIntent: paymentIntent as never,
				metadata: paymentIntent.metadata,
			}
		)

		expect(outcome).toBe('refunded-unattributable')
		expect(await outbox()).toEqual([
			expect.objectContaining({
				id: 'refund-unattributable-pi_orphan',
				toPlayerId: PAYER,
				template: 'teamRefundReceipt',
				props: expect.objectContaining({
					teamName: null,
					seasonName: '2026 Fall',
					amount: '$25.00',
				}),
			}),
		])
	})
})

describe('why a refund was made', () => {
	/** Settles the team, running the receipt trigger for each change. */
	const settleAndReceipt = async (): Promise<void> => {
		const before = new Map(
			(
				await teamContributionsCollection(firestore, TEAM, SEASON).get()
			).docs.map((doc) => [doc.id, doc.data()])
		)
		await settleTeamSeason(TEAM, SEASON, { firestore })
		for (const [id, data] of before) await fire(id, data, await current(id))
	}

	const refundReceipts = async () =>
		(await outbox()).filter((m) => m.template === 'teamRefundReceipt')

	it('refunds what a registered team was paid beyond its fee, and says so', async () => {
		await pay('pi_1', 60_000)
		await pay('pi_2', 60_000)
		await teamSeasonRef(firestore, TEAM, SEASON).update({ registered: true })

		await settleAndReceipt()

		expect((await current('pi_2'))?.refundCause).toBe('excess')
		const [receipt] = await refundReceipts()
		expect(receipt.props).toMatchObject({
			amount: '$200.00',
			originallyPaid: '$600.00',
			fullRefund: false,
			cause: 'excess',
			teamRegistered: true,
			// A registered team is in; its money is not counted out again.
			standing: null,
		})
	})

	it('refunds a team that missed out on a full season, and says so', async () => {
		await pay('pi_1', 1_000)
		await seasonRef().update({ registeredTeamCount: 12 })

		await settleAndReceipt()

		expect((await current('pi_1'))?.refundCause).toBe('season-full')
		expect((await refundReceipts())[0].props).toMatchObject({
			cause: 'season-full',
			fullRefund: true,
		})
	})

	it('refunds a team once registration has closed, and says so', async () => {
		await pay('pi_1', 1_000)
		await seasonRef().update({
			// Closed an hour ago: past the grace a late checkout gets.
			registrationEnd: Timestamp.fromMillis(Date.now() - 60 * 60_000),
		})

		await settleAndReceipt()

		expect((await refundReceipts())[0].props.cause).toBe('registration-closed')
	})

	it('refunds a payer who left the team, and says so', async () => {
		await pay('pi_1', 1_000)
		await teamRosterEntryRef(firestore, TEAM, SEASON, PAYER).delete()

		await settleAndReceipt()

		expect((await refundReceipts())[0].props.cause).toBe('left-team')
	})

	it('records an admin’s refund as theirs', async () => {
		await pay('pi_1', 1_000)
		const before = await current('pi_1')
		const { FakeStripe } = await import('./fake-stripe.js')

		await refundContribution(firestore, new FakeStripe() as never, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
		})
		await fire('pi_1', before, await current('pi_1'))

		expect((await refundReceipts())[0].props).toMatchObject({
			cause: 'admin',
			// The team is still in the running, so where it stands is shown.
			standing: expect.objectContaining({ paid: '$0.00' }),
		})
	})

	it('reaches a team that missed out with the reason and no invitation to pay again', async () => {
		await setEmailMode(firestore, 'live')
		await pay('pi_1', 1_000)
		await seasonRef().update({ registeredTeamCount: 12 })
		await settleAndReceipt()
		const [receipt] = await refundReceipts()
		const resend = fakeResend()

		await deliverQueuedEmail(firestore, receipt.id, resend)

		const { text } = resend.sent[0].email
		expect(text).toContain(
			'Every team spot in the 2026 Fall season filled before Chao World registered'
		)
		expect(text).not.toContain('to go')
		expect(text).not.toContain('See your team')
	})
})
