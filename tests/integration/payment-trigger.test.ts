import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * onPaymentCreated is the most consequential trigger in the codebase: it runs
 * after a player has actually been charged. If it fails, someone has paid and
 * has no paid flag, and nothing surfaces that to them or to an admin.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const UID = 'player-1'
const PAYMENT = 'pay-1'
const CURRENT_SEASON = 'season-current'
const OLD_SEASON = 'season-old'

const seasonRef = (id: string) => firestore.collection('seasons').doc(id)

/** Fires the trigger for a payment document under stripe/{uid}/payments. */
const fire = (uid = UID, paymentId = PAYMENT) =>
	manifest.onPaymentCreated.run({
		id: 'evt-1',
		params: { uid, paymentId },
		data: { exists: true, data: () => ({}) },
	})

const seedPayment = async (
	status: string,
	uid = UID,
	paymentId = PAYMENT
): Promise<void> => {
	await firestore
		.collection('stripe')
		.doc(uid)
		.collection('payments')
		.doc(paymentId)
		.set({ status, amount: 5000, created: Timestamp.now() })
}

const readPlayerSeason = async (seasonId = CURRENT_SEASON) =>
	(await playerSeasonRef(firestore, UID, seasonId).get()).data()

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)

	// getCurrentSeason() picks the newest by dateStart.
	await seasonRef(OLD_SEASON).set({
		name: '2029',
		dateStart: Timestamp.fromDate(new Date('2029-01-01')),
	})
	await seasonRef(CURRENT_SEASON).set({
		name: '2030',
		dateStart: Timestamp.fromDate(new Date('2030-01-01')),
	})

	await firestore.collection('players').doc(UID).set({
		admin: false,
		email: 'player@example.com',
		firstname: 'Test',
		lastname: 'Player',
	})
})

describe('onPaymentCreated', () => {
	it('marks the player paid for the current season', async () => {
		await seedPayment('paid')
		await fire()

		expect((await readPlayerSeason())?.paid).toBe(true)
	})

	it('creates the season subdoc when a payment lands before one exists', async () => {
		// Defensive path: Stripe can deliver before the player has any season
		// state. Everything except paid must start false.
		await seedPayment('paid')
		await fire()

		expect(await readPlayerSeason()).toMatchObject({
			paid: true,
			signed: false,
			captain: false,
			team: null,
		})
	})

	it('preserves existing season state when one already exists', async () => {
		await playerSeasonRef(firestore, UID, CURRENT_SEASON).set({
			season: seasonRef(CURRENT_SEASON),
			team: firestore.collection('teams').doc('team-1'),
			paid: false,
			signed: false,
			captain: true,
		})
		await seedPayment('paid')
		await fire()

		const season = await readPlayerSeason()
		expect(season?.paid).toBe(true)
		// Paying must not drop the player off their team or demote them.
		expect(season?.team?.id).toBe('team-1')
		expect(season?.captain).toBe(true)
	})

	it.each(['pending', 'failed', 'canceled'])(
		'ignores a payment with status %s',
		async (status) => {
			await seedPayment(status)
			await fire()

			expect(await readPlayerSeason()).toBeUndefined()
		}
	)

	it('does nothing when the payment document is missing', async () => {
		await fire()
		expect(await readPlayerSeason()).toBeUndefined()
	})

	it('is a no-op when the player is already paid', async () => {
		// Stripe can deliver the same event twice.
		await seedPayment('paid')
		await fire()

		await seedPayment('paid', UID, 'pay-2')
		await fire(UID, 'pay-2')

		expect((await readPlayerSeason())?.paid).toBe(true)
	})

	it('throws when the player document is missing, so the event is retried', async () => {
		// The player has been charged; losing the event silently would leave
		// them paid with no record of it.
		await firestore.collection('players').doc(UID).delete()
		await seedPayment('paid')

		await expect(fire()).rejects.toThrow(/onPaymentCreated/)
	})

	it('throws when there is no season to attribute the payment to', async () => {
		await seasonRef(CURRENT_SEASON).delete()
		await seasonRef(OLD_SEASON).delete()
		await seedPayment('paid')

		await expect(fire()).rejects.toThrow(/onPaymentCreated/)
	})

	it('early-returns while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await seedPayment('paid')
		await fire()

		expect(await readPlayerSeason()).toBeUndefined()
	})
})
