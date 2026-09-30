import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import type { TeamContributionDocument } from '../types.js'
import {
	formatMoney,
	paymentMethodOf,
	receiptFor,
	receiptMailId,
	teamNameFromDescription,
} from './receipts.js'
import { possessive } from './templates/Receipts.js'

const contribution = (
	overrides: Partial<TeamContributionDocument> = {}
): TeamContributionDocument =>
	({
		player: { id: 'player-1' },
		amountCents: 50_000,
		status: 'paid',
		paymentIntentId: 'pi_1',
		...overrides,
	}) as TeamContributionDocument

describe('receiptFor', () => {
	it('sends a payment receipt for a new paid contribution', () => {
		expect(receiptFor(undefined, contribution())).toEqual({ kind: 'payment' })
	})

	it('sends a full refund receipt when a payment is refunded whole', () => {
		expect(
			receiptFor(contribution(), contribution({ status: 'refunded' }))
		).toEqual({ kind: 'refund', refundedCents: 50_000, fullRefund: true })
	})

	it('sends a partial refund receipt for what a partial refund gave back', () => {
		expect(
			receiptFor(
				contribution(),
				contribution({ amountCents: 30_000, paidAmountCents: 50_000 })
			)
		).toEqual({ kind: 'refund', refundedCents: 20_000, fullRefund: false })
	})

	it('refunds the rest after an earlier partial refund, which is not a full refund', () => {
		expect(
			receiptFor(
				contribution({ amountCents: 30_000, paidAmountCents: 50_000 }),
				contribution({
					status: 'refunded',
					amountCents: 50_000,
					paidAmountCents: 50_000,
				})
			)
		).toEqual({ kind: 'refund', refundedCents: 30_000, fullRefund: false })
	})

	it.each([
		['a deletion', contribution(), undefined],
		['an update that changes no money', contribution(), contribution()],
		[
			'a refunded contribution touched again',
			contribution({ status: 'refunded' }),
			contribution({ status: 'refunded' }),
		],
		[
			'a contribution created already refunded',
			undefined,
			contribution({ status: 'refunded' }),
		],
	])('sends nothing for %s', (_label, before, after) => {
		expect(receiptFor(before, after)).toBeNull()
	})
})

describe('receiptMailId', () => {
	it('gives a payment one receipt, and each refund its own', () => {
		const payment = receiptMailId('pi_1', { kind: 'payment' }, contribution())
		const partial = receiptMailId(
			'pi_1',
			{ kind: 'refund', refundedCents: 20_000, fullRefund: false },
			contribution({ amountCents: 30_000 })
		)
		const rest = receiptMailId(
			'pi_1',
			{ kind: 'refund', refundedCents: 30_000, fullRefund: false },
			contribution({ status: 'refunded' })
		)
		expect(new Set([payment, partial, rest]).size).toBe(3)
		expect(payment).toBe('receipt-pi_1')
	})
})

const charge = (details: unknown) =>
	({ payment_method_details: details }) as Pick<
		Stripe.Charge,
		'payment_method_details'
	>

describe('paymentMethodOf', () => {
	it('names a card by brand and last four', () => {
		expect(
			paymentMethodOf(
				charge({ type: 'card', card: { brand: 'visa', last4: '4242' } })
			)
		).toBe('Visa •••• 4242')
	})

	it('names a wallet with the card behind it', () => {
		expect(
			paymentMethodOf(
				charge({
					type: 'card',
					card: {
						brand: 'mastercard',
						last4: '5454',
						wallet: { type: 'apple_pay' },
					},
				})
			)
		).toBe('Apple Pay (Mastercard •••• 5454)')
	})

	it('names Link, however Stripe reports it', () => {
		expect(paymentMethodOf(charge({ type: 'link' }))).toBe('Link')
		expect(
			paymentMethodOf(
				charge({
					type: 'card',
					card: { brand: 'visa', last4: '1', wallet: { type: 'link' } },
				})
			)
		).toBe('Link')
	})

	it('says "Card" for a brand it does not know', () => {
		expect(
			paymentMethodOf(
				charge({ type: 'card', card: { brand: 'newbrand', last4: '0001' } })
			)
		).toBe('Card •••• 0001')
	})

	it('leaves the method out when Stripe gave no details', () => {
		expect(paymentMethodOf(null)).toBeNull()
		expect(paymentMethodOf(charge(null))).toBeNull()
	})
})

describe('formatMoney', () => {
	it.each([
		[1_000, '$10.00'],
		[100_000, '$1,000.00'],
		[99_050, '$990.50'],
		[0, '$0.00'],
	])('shows %i cents as %s', (cents, text) => {
		expect(formatMoney(cents)).toBe(text)
	})
})

describe('possessive', () => {
	it.each([
		['Chao World', 'Chao World’s'],
		['Frost Giants', 'Frost Giants’'],
		['TOUCANS', 'TOUCANS’'],
	])('writes %s as %s', (name, text) => {
		expect(possessive(name)).toBe(text)
	})
})

describe('teamNameFromDescription', () => {
	// createTeamContributionCheckout writes the description this way; a
	// receipt falls back to it when the team-season has since been deleted.
	it('reads the team from a team registration payment', () => {
		expect(
			teamNameFromDescription('Team registration: Chao World, 2026 Fall')
		).toBe('Chao World')
	})

	it('keeps a comma inside the team name', () => {
		expect(
			teamNameFromDescription('Team registration: Hucks, Inc., 2026 Fall')
		).toBe('Hucks, Inc.')
	})

	it('returns null for any other description', () => {
		expect(teamNameFromDescription('Winter League registration')).toBeNull()
		expect(teamNameFromDescription(null)).toBeNull()
		expect(teamNameFromDescription(undefined)).toBeNull()
	})
})
