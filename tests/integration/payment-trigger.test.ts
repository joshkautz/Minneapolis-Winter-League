import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * onPaymentCreated is the most consequential trigger in the codebase: it runs
 * after a player has actually been charged. If it fails, someone has paid and
 * has neither a paid flag nor a waiver to sign, and nothing surfaces that to
 * them or to an admin.
 *
 * Dropbox Sign is stubbed — these tests cover our logic around it, not their
 * API. The stub also lets the tests assert what we *send*, which is how the
 * webhook later finds the player: the signature request carries firebaseUID
 * and seasonId as metadata, and a wrong value there orphans the waiver.
 */

const sendWithTemplate = vi.fn()

// Partial mock: only SignatureRequestApi is replaced. The rest of the SDK
// stays real because importing the deploy manifest also pulls in
// dropboxSign.ts, which needs EventCallbackRequestEvent at module load.
vi.mock('@dropbox/sign', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	SignatureRequestApi: class {
		username = ''
		signatureRequestSendWithTemplate = sendWithTemplate
	},
}))

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

const readWaivers = async (uid = UID) =>
	(
		await firestore.collection('dropbox').doc(uid).collection('waivers').get()
	).docs.map((d) => d.data())

const readPlayerSeason = async (seasonId = CURRENT_SEASON) =>
	(await playerSeasonRef(firestore, UID, seasonId).get()).data()

beforeAll(async () => {
	process.env.DROPBOX_SIGN_API_KEY ??= 'test-dropbox-key'
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	vi.clearAllMocks()
	sendWithTemplate.mockResolvedValue({
		body: { signatureRequest: { signatureRequestId: 'sig-req-1' } },
	})

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

	it('does not send a waiver', async () => {
		// Waivers moved to onRosterEntryCreated. Tying one to a payment
		// worked only while every player paid for themselves; under
		// team-level payment one person can pay for everyone, and the rest
		// would go without. See waiver-on-roster-join.test.ts.
		await seedPayment('paid')
		await fire()

		expect(sendWithTemplate).not.toHaveBeenCalled()
		expect(await readWaivers()).toHaveLength(0)
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
			expect(sendWithTemplate).not.toHaveBeenCalled()
		}
	)

	it('does nothing when the payment document is missing', async () => {
		await fire()
		expect(sendWithTemplate).not.toHaveBeenCalled()
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

	it('records no waiver when Dropbox Sign returns no signature request id', async () => {
		// The paid flag is already committed by then, so the player is marked
		// paid and simply has no waiver yet rather than a broken record.
		sendWithTemplate.mockResolvedValue({ body: {} })
		await seedPayment('paid')
		await fire()

		expect((await readPlayerSeason())?.paid).toBe(true)
		expect(await readWaivers()).toHaveLength(0)
	})

	it('early-returns while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await seedPayment('paid')
		await fire()

		expect(await readPlayerSeason()).toBeUndefined()
		expect(sendWithTemplate).not.toHaveBeenCalled()
	})
})
