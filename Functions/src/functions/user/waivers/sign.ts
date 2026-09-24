/**
 * Sign the league waiver for the current season.
 *
 * Replaces Dropbox Sign: the player reads the waiver and signs it in the
 * app, and this records the signature and marks them signed for the season
 * in one transaction. `updateTeamRegistrationOnPlayerChange` then re-checks
 * their team's registration, exactly as it did when Dropbox Sign's webhook
 * set the flag.
 *
 * Security validations performed:
 * - Caller must be authenticated with a verified email
 * - Caller must not be banned
 * - A season must exist, and must not have ended
 * - The version signed must be the current one
 * - The submission must pass the rules in `waiver/rules.ts`, the same ones
 *   the form applies: an adult types the name on their profile, and anyone
 *   under 18 is signed for by a parent or guardian
 * - A player signs only for themselves; the record goes under their own uid
 *
 * Signing is idempotent: a player already signed for the season gets
 * `alreadySigned` and no second record, whatever the order of two requests.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
	FieldValue,
	getFirestore,
	type DocumentReference,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { getCurrentSeason, playerSeasonRef } from '../../../shared/database.js'
import {
	Collections,
	WAIVER_SIGNATURES_SUBCOLLECTION,
	type PlayerDocument,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type WaiverSignatureDocument,
} from '../../../types.js'
import {
	CURRENT_WAIVER_VERSION_ID,
	currentWaiverVersion,
} from '../../../waiver/versions.js'
import {
	isMinorOn,
	leagueToday,
	waiverSubmissionErrors,
	type WaiverSubmission,
} from '../../../waiver/rules.js'
import { waiverFingerprint } from '../../../waiver/fingerprint.js'

export interface SignWaiverResponse {
	success: true
	/** The player had already signed for this season; nothing was recorded. */
	alreadySigned: boolean
	seasonId: string
}

/** Every field arrives from the client; treat nothing as the declared type. */
const asString = (value: unknown): string =>
	typeof value === 'string' ? value : ''

const readSubmission = (data: unknown): WaiverSubmission => {
	const raw = (data ?? {}) as Record<string, unknown>
	const contacts = Array.isArray(raw.emergencyContacts)
		? raw.emergencyContacts
		: []
	return {
		versionId: asString(raw.versionId),
		dateOfBirth: asString(raw.dateOfBirth),
		mailingAddress: asString(raw.mailingAddress),
		emergencyContacts: contacts.map((contact) => {
			const entry = (contact ?? {}) as Record<string, unknown>
			return {
				name: asString(entry.name),
				relationship: asString(entry.relationship),
				phone: asString(entry.phone),
			}
		}),
		signerName: asString(raw.signerName),
		guardianRelationship: asString(raw.guardianRelationship),
		agreed: raw.agreed === true,
	}
}

/** The first address in X-Forwarded-For is the client's; the rest are proxies. */
const clientIp = (rawRequest: {
	ip?: string
	headers?: Record<string, string | string[] | undefined>
}): string | null => {
	const forwarded = rawRequest.headers?.['x-forwarded-for']
	const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
		?.split(',')[0]
		?.trim()
	return first || rawRequest.ip || null
}

export const signWaiver = onCall<WaiverSubmission>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<SignWaiverResponse> => {
		validateAuthentication(request.auth)
		const uid = request.auth.uid
		const submission = readSubmission(request.data)
		const firestore = getFirestore()

		if (submission.versionId !== CURRENT_WAIVER_VERSION_ID) {
			// The page was loaded before the waiver changed. A reload shows the
			// current text, which is the one to agree to.
			throw new HttpsError(
				'failed-precondition',
				'The waiver has been updated. Reload the page to read and sign the current version.'
			)
		}

		const season = (await getCurrentSeason()) as
			(SeasonDocument & { id: string }) | null
		if (!season) {
			throw new HttpsError('failed-precondition', 'No current season found')
		}
		if (season.dateEnd && season.dateEnd.toMillis() < Date.now()) {
			throw new HttpsError(
				'failed-precondition',
				`${season.name} has ended. The waiver for the next season opens when it is announced.`
			)
		}

		await validateNotBanned(firestore, uid)

		const playerSnap = await firestore
			.collection(Collections.PLAYERS)
			.doc(uid)
			.get()
		const player = playerSnap.data() as PlayerDocument | undefined
		if (!player) {
			throw new HttpsError('not-found', 'Player not found')
		}
		const participantName = `${player.firstname} ${player.lastname}`.trim()
		const today = leagueToday()

		const errors = waiverSubmissionErrors(submission, {
			participantName,
			today,
		})
		const firstError = Object.values(errors)[0]
		if (firstError) {
			throw new HttpsError('invalid-argument', firstError)
		}

		const minor = isMinorOn(submission.dateOfBirth, today)
		const version = currentWaiverVersion()
		const seasonRef = firestore
			.collection(Collections.SEASONS)
			.doc(season.id) as DocumentReference<SeasonDocument>
		const playerSeasonDocRef = playerSeasonRef(firestore, uid, season.id)
		const signatureRef = playerSnap.ref
			.collection(WAIVER_SIGNATURES_SUBCOLLECTION)
			.doc()

		const record: Omit<WaiverSignatureDocument, 'signedAt'> & {
			signedAt: FieldValue
		} = {
			seasonId: season.id,
			versionId: version.id,
			versionSha256: waiverFingerprint(version),
			method: 'player',
			recordedBy: uid,
			signedAt: FieldValue.serverTimestamp(),
			participantName,
			signerName: submission.signerName.trim(),
			signerRole: minor ? 'guardian' : 'participant',
			guardianRelationship: minor
				? (submission.guardianRelationship?.trim() ?? null)
				: null,
			dateOfBirth: submission.dateOfBirth,
			mailingAddress: submission.mailingAddress.trim(),
			emergencyContacts: submission.emergencyContacts.map((contact) => ({
				name: contact.name.trim(),
				relationship: contact.relationship.trim(),
				phone: contact.phone.trim(),
			})),
			email: request.auth.token.email ?? player.email ?? null,
			ipAddress: clientIp(request.rawRequest),
			userAgent:
				(request.rawRequest.headers?.['user-agent'] as string | undefined) ??
				null,
			note: null,
		}

		// The player-season is read inside the transaction, so of two requests
		// racing — a double tap, two open tabs — one records and the other sees
		// it signed. The record is the reason `signed` is true, so both are
		// written together or not at all.
		const alreadySigned = await firestore.runTransaction(async (txn) => {
			const playerSeasonSnap = await txn.get(playerSeasonDocRef)
			if (playerSeasonSnap.data()?.signed === true) return true

			txn.create(signatureRef, record)
			if (playerSeasonSnap.exists) {
				txn.update(playerSeasonDocRef, { signed: true })
			} else {
				// Players normally get a player-season for every season, but one
				// missing should not stop them signing. Creating it fires no
				// registration check, and needs none: without a player-season
				// they are on no team.
				const fresh: PlayerSeasonDocument = {
					season: seasonRef,
					team: null,
					paid: false,
					signed: true,
					captain: false,
				}
				txn.set(playerSeasonDocRef, fresh)
			}
			return false
		})

		logger.info(alreadySigned ? 'Waiver already signed' : 'Waiver signed', {
			uid,
			seasonId: season.id,
			versionId: version.id,
			signerRole: record.signerRole,
		})

		return { success: true, alreadySigned, seasonId: season.id }
	}
)
