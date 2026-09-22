/**
 * Waiver request helper.
 *
 * Every player needs a signed waiver for the season they play in, and the
 * waiver is what makes them a registered player — payment does not.
 *
 * Issuing one means calling Dropbox Sign, which is an external request and so
 * cannot happen inside a Firestore transaction. It therefore runs from a
 * trigger after the membership write has committed, never inline with it.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { SignatureRequestApi, SubSigningOptions } from '@dropbox/sign'
import { EMAIL_CONFIG, getDropboxSignConfig } from '../config/constants.js'
import { Collections, PlayerDocument } from '../types.js'

/** What `requestWaiver` did, so callers can log it without re-deriving it. */
export type WaiverRequestOutcome =
	| { outcome: 'sent'; signatureRequestId: string }
	| { outcome: 'already-requested' }
	| { outcome: 'no-player' }
	| { outcome: 'no-signature-request-id' }

/**
 * Sends a player their waiver for a season, unless they already have one.
 *
 * Idempotent on (player, season): a player who already has a waiver document
 * for the season is left alone, whatever its status. That guard is what makes
 * this safe to call from a trigger, which can fire more than once for the
 * same membership — a team merge, for instance, rewrites roster entries for
 * players who were already on a roster and already hold a waiver.
 *
 * Returns rather than throws for the cases that are not faults, so a trigger
 * does not retry something that will never succeed.
 */
export async function requestWaiver(
	firestore: FirebaseFirestore.Firestore,
	params: { playerId: string; seasonId: string }
): Promise<WaiverRequestOutcome> {
	const { playerId, seasonId } = params

	const existingWaiver = await firestore
		.collection(Collections.DROPBOX)
		.doc(playerId)
		.collection('waivers')
		.where('seasonId', '==', seasonId)
		.limit(1)
		.get()

	if (!existingWaiver.empty) {
		return { outcome: 'already-requested' }
	}

	const playerSnapshot = await firestore
		.collection(Collections.PLAYERS)
		.doc(playerId)
		.get()
	const player = playerSnapshot.data() as PlayerDocument | undefined

	if (!player?.email) {
		// A roster entry can outlive the player document it points at. There is
		// nobody to send to, and retrying will not change that.
		logger.warn('Cannot request a waiver: no player document or email', {
			playerId,
			seasonId,
		})
		return { outcome: 'no-player' }
	}

	const dropboxConfig = getDropboxSignConfig()
	const dropbox = new SignatureRequestApi()
	dropbox.username = dropboxConfig.API_KEY

	const signatureResponse = await dropbox.signatureRequestSendWithTemplate({
		templateIds: [dropboxConfig.TEMPLATE_ID],
		subject: EMAIL_CONFIG.WAIVER_SUBJECT,
		message: EMAIL_CONFIG.WAIVER_MESSAGE,
		signers: [
			{
				role: 'Participant',
				name: `${player.firstname} ${player.lastname}`,
				emailAddress: player.email,
			},
		],
		signingOptions: {
			draw: true,
			type: true,
			upload: true,
			phone: false,
			defaultType: SubSigningOptions.DefaultTypeEnum.Type,
		},
		// dropboxSignWebhook matches the signed waiver back to a player with
		// exactly these two fields. A wrong value here orphans the waiver.
		metadata: {
			firebaseUID: playerId,
			seasonId,
		},
		testMode: dropboxConfig.TEST_MODE,
	})

	const signatureRequestId =
		signatureResponse.body.signatureRequest?.signatureRequestId

	if (!signatureRequestId) {
		logger.error('Dropbox Sign returned no signature request id', {
			playerId,
			seasonId,
		})
		return { outcome: 'no-signature-request-id' }
	}

	await firestore
		.collection(Collections.DROPBOX)
		.doc(playerId)
		.collection('waivers')
		.add({
			seasonId,
			signatureRequestId,
			status: 'pending',
			createdAt: FieldValue.serverTimestamp(),
		})

	return { outcome: 'sent', signatureRequestId }
}

/** Convenience for callers that do not already hold a Firestore handle. */
export async function requestWaiverForPlayer(params: {
	playerId: string
	seasonId: string
}): Promise<WaiverRequestOutcome> {
	return requestWaiver(getFirestore(), params)
}
