import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { reservedCents } from './checkoutReservations.js'
import type { CheckoutReservation } from '../types.js'

/**
 * What teammates' open checkouts take off what a payer may put in. Every
 * reservation that exists counts, whatever its time: the service asks
 * Stripe about the ones past it, and removes only those whose session can no
 * longer take money.
 */

const reservation = (
	playerId: string,
	amountCents: number,
	expiresInMs = 20 * 60_000
): CheckoutReservation =>
	({
		player: { id: playerId },
		amountCents,
		sessionId: 'cs_1',
		expiresAt: Timestamp.fromMillis(Date.now() + expiresInMs),
		createdAt: Timestamp.now(),
	}) as unknown as CheckoutReservation

describe('reservedCents', () => {
	it('is nothing with nothing open', () => {
		expect(reservedCents({})).toBe(0)
	})

	it('sums what every teammate is paying', () => {
		expect(
			reservedCents({
				a: reservation('alex', 30_000),
				b: reservation('blair', 20_000),
			})
		).toBe(50_000)
	})

	it('still counts one past its time, until Stripe says it closed', () => {
		expect(reservedCents({ a: reservation('alex', 30_000, -60_000) })).toBe(
			30_000
		)
	})
})
