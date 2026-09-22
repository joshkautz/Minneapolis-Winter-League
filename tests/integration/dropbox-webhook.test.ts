import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Request, Response } from 'firebase-functions/v2/https'
import { initTestApp, resetFirestore } from './helpers.js'

/**
 * The other half of the waiver flow. `onPaymentCreated` sends a signature
 * request tagged with `firebaseUID` and `seasonId`; this webhook is how the
 * signature comes back and how a player's season subdoc ever gets
 * `signed: true`. Without it a paid player stays unregistered forever, and
 * team registration — which needs paid *and* signed — never flips.
 *
 * `webhooks.test.ts` covers the guards with everything mocked. These tests
 * run the handler against the Firestore emulator with a genuinely signed
 * payload: Dropbox Sign's event hash is HMAC-SHA256 of
 * `event_time + event_type` keyed with the API key, so a real signature can
 * be produced without mocking the verifier and the real one stays under test.
 */

const API_KEY = 'integration-test-dropbox-key'
const PLAYER = 'player-1'
const SEASON = 'season-1'
const SIGNATURE_REQUEST = 'sig-request-1'

let firestore: Firestore
let handler: (req: Request, resp: Response) => Promise<void>

/** Builds the multipart-ish body Dropbox Sign posts, correctly signed. */
const signedBody = (options: {
	eventType: string
	signatureRequestId?: string | null
	metadata?: Record<string, string> | null
	eventTime?: string
	apiKey?: string
}): Buffer => {
	const eventTime = options.eventTime ?? '1700000000'
	const eventHash = createHmac('sha256', options.apiKey ?? API_KEY)
		.update(eventTime + options.eventType)
		.digest('hex')

	const payload: Record<string, unknown> = {
		event: {
			event_time: eventTime,
			event_type: options.eventType,
			event_hash: eventHash,
		},
	}

	if (options.signatureRequestId !== null) {
		payload.signature_request = {
			signature_request_id: options.signatureRequestId ?? SIGNATURE_REQUEST,
			...(options.metadata === null
				? {}
				: {
						metadata: options.metadata ?? {
							firebaseUID: PLAYER,
							seasonId: SEASON,
						},
					}),
		}
	}

	// Dropbox Sign posts multipart form data; the handler pulls the JSON out
	// with a regex, so the surrounding noise has to be there.
	return Buffer.from(
		`--boundary\r\nContent-Disposition: form-data; name="json"\r\n\r\n${JSON.stringify(payload)}\r\n--boundary--`
	)
}

/** Captures the status and body the handler sends. */
const makeResponse = (): Response & { statusCode?: number; body?: unknown } => {
	const res: Record<string, unknown> = {}
	res.status = (code: number) => {
		res.statusCode = code
		return res
	}
	res.send = (body: unknown) => {
		res.body = body
		return res
	}
	return res as unknown as Response & { statusCode?: number; body?: unknown }
}

const post = async (body: Buffer) => {
	const resp = makeResponse()
	await handler({ body } as unknown as Request, resp)
	return resp
}

const waiverRef = (signatureRequestId = SIGNATURE_REQUEST) =>
	firestore
		.collection('dropbox')
		.doc(PLAYER)
		.collection('waivers')
		.doc(signatureRequestId)

const playerSeasonRef = (playerId = PLAYER, seasonId = SEASON) =>
	firestore
		.collection('players')
		.doc(playerId)
		.collection('playerSeasons')
		.doc(seasonId)

const readWaiver = async (signatureRequestId = SIGNATURE_REQUEST) =>
	(await waiverRef(signatureRequestId).get()).data()

const readPlayerSeason = async (playerId = PLAYER, seasonId = SEASON) =>
	(await playerSeasonRef(playerId, seasonId).get()).data()

/** A paid player with a pending waiver — the state after onPaymentCreated. */
const seedPendingWaiver = async (options?: {
	signatureRequestId?: string
	seasonId?: string
}) => {
	const seasonId = options?.seasonId ?? SEASON
	await waiverRef(options?.signatureRequestId).set({
		seasonId,
		signatureRequestId: options?.signatureRequestId ?? SIGNATURE_REQUEST,
		status: 'pending',
		createdAt: Timestamp.now(),
	})
	await playerSeasonRef(PLAYER, seasonId).set({
		season: firestore.collection('seasons').doc(seasonId),
		team: null,
		captain: false,
		paid: true,
		signed: false,
		banned: false,
	})
}

beforeAll(async () => {
	firestore = initTestApp()
	// getDropboxSignConfig reads this at call time, so the module can be
	// imported normally as long as the key is set before the handler runs.
	process.env.DROPBOX_SIGN_API_KEY = API_KEY
	const mod = await import('../../Functions/src/index.js')
	handler = mod.dropboxSignWebhook as unknown as typeof handler
})

beforeEach(async () => {
	await resetFirestore(firestore)
})

describe('dropboxSignWebhook', () => {
	it('marks the waiver signed and the player signed for the season', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({ eventType: 'signature_request_signed' })
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('signed')
		expect((await readWaiver())?.signedAt).toBeInstanceOf(Timestamp)
		expect((await readPlayerSeason())?.signed).toBe(true)
	})

	it('finds the waiver by the metadata onPaymentCreated attached', async () => {
		// The signature request id alone is not enough: waivers are stored
		// under dropbox/{firebaseUID}/waivers, so a wrong firebaseUID means
		// the lookup misses and a genuinely signed waiver is never recorded.
		await seedPendingWaiver()

		await post(
			signedBody({
				eventType: 'signature_request_signed',
				metadata: { firebaseUID: 'someone-else', seasonId: SEASON },
			})
		)

		expect((await readWaiver())?.status).toBe('pending')
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('leaves the player unsigned when the waiver is declined', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({ eventType: 'signature_request_declined' })
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('declined')
		expect((await readWaiver())?.signedAt).toBeUndefined()
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('leaves the player unsigned when the waiver is canceled', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({ eventType: 'signature_request_canceled' })
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('canceled')
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('does not un-sign a player when a later decline arrives', async () => {
		// Out-of-order delivery is possible. A decline after a signature must
		// not silently strip registration from someone already signed.
		await seedPendingWaiver()
		await post(signedBody({ eventType: 'signature_request_signed' }))

		await post(signedBody({ eventType: 'signature_request_declined' }))

		expect((await readPlayerSeason())?.signed).toBe(true)
	})

	it('ignores an event type it does not handle', async () => {
		await seedPendingWaiver()

		const resp = await post(signedBody({ eventType: 'signature_request_sent' }))

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('pending')
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('acknowledges a duplicate delivery without writing again', async () => {
		await seedPendingWaiver()
		await post(signedBody({ eventType: 'signature_request_signed' }))
		const firstSignedAt = (await readWaiver())?.signedAt as Timestamp

		const resp = await post(
			signedBody({ eventType: 'signature_request_signed' })
		)

		expect(resp.statusCode).toBe(200)
		// A re-write would move signedAt to the second delivery's time.
		expect((await readWaiver())?.signedAt).toStrictEqual(firstSignedAt)
	})

	it('signs the player when a retry follows a partially applied update', async () => {
		// The waiver is already signed but the player is not — the state a
		// crash between the two writes would leave. The retry has to finish
		// the job rather than short-circuit on the waiver's status.
		await seedPendingWaiver()
		await waiverRef().update({
			status: 'signed',
			signedAt: Timestamp.now(),
		})

		await post(signedBody({ eventType: 'signature_request_signed' }))

		expect((await readPlayerSeason())?.signed).toBe(true)
	})

	it('acknowledges an event for a signature request it has no waiver for', async () => {
		// Dropbox Sign retries anything that is not a 200, so an unknown
		// request must still be acknowledged or it is redelivered forever.
		const resp = await post(
			signedBody({ eventType: 'signature_request_signed' })
		)

		expect(resp.statusCode).toBe(200)
	})

	it('signs the waiver even when the player has no subdoc for the season', async () => {
		await waiverRef().set({
			seasonId: SEASON,
			signatureRequestId: SIGNATURE_REQUEST,
			status: 'pending',
			createdAt: Timestamp.now(),
		})

		const resp = await post(
			signedBody({ eventType: 'signature_request_signed' })
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('signed')
		// The subdoc is not created here; onPaymentCreated owns that.
		expect(await readPlayerSeason()).toBeUndefined()
	})

	it('only signs the season the event names', async () => {
		await seedPendingWaiver()
		await seedPendingWaiver({
			signatureRequestId: 'sig-request-2',
			seasonId: 'season-2',
		})

		await post(signedBody({ eventType: 'signature_request_signed' }))

		expect((await readPlayerSeason(PLAYER, SEASON))?.signed).toBe(true)
		expect((await readPlayerSeason(PLAYER, 'season-2'))?.signed).toBe(false)
		expect((await readWaiver('sig-request-2'))?.status).toBe('pending')
	})

	it('rejects a payload signed with the wrong key and writes nothing', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({
				eventType: 'signature_request_signed',
				apiKey: 'not-the-api-key',
			})
		)

		expect(resp.statusCode).toBe(401)
		expect((await readWaiver())?.status).toBe('pending')
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('rejects a payload whose event type was tampered with after signing', async () => {
		// The hash covers event_time and event_type, so swapping the type
		// invalidates it. This is the attack the guard exists to stop: an
		// attacker replaying a real "declined" event as "signed".
		await seedPendingWaiver()
		const body = signedBody({ eventType: 'signature_request_declined' })
			.toString()
			.replace('signature_request_declined', 'signature_request_signed')

		const resp = await post(Buffer.from(body))

		expect(resp.statusCode).toBe(401)
		expect((await readPlayerSeason())?.signed).toBe(false)
	})

	it('acknowledges a signed event carrying no metadata', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({ eventType: 'signature_request_signed', metadata: null })
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('pending')
	})

	it('acknowledges a signed event missing the season in its metadata', async () => {
		await seedPendingWaiver()

		const resp = await post(
			signedBody({
				eventType: 'signature_request_signed',
				metadata: { firebaseUID: PLAYER },
			})
		)

		expect(resp.statusCode).toBe(200)
		expect((await readWaiver())?.status).toBe('pending')
	})

	it('acknowledges an event with no signature request at all', async () => {
		const resp = await post(
			signedBody({
				eventType: 'signature_request_signed',
				signatureRequestId: null,
			})
		)

		expect(resp.statusCode).toBe(200)
	})
})
