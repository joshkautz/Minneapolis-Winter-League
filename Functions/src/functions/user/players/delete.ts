/**
 * Delete player callable function: a player deletes their own account.
 *
 * Removes their data (`deletePlayerAccountData`) and then their sign-in, so
 * the account is gone rather than left able to sign in to nothing. Their
 * waiver signatures are kept as a legal record; see docs/WAIVERS.md.
 *
 * Security validations performed:
 * - Caller must be authenticated. An unverified email is allowed: deleting
 *   an account should not depend on first verifying it.
 * - A player deletes only their own account; there is no target parameter.
 * - Caller must have signed in within RECENT_SIGN_IN_SECONDS, as Firebase
 *   requires for deleting an account from the client. The App re-enters the
 *   password first, so a left-open session cannot delete the account.
 * - Not while on a team for the current season: leaving first keeps a
 *   deletion from quietly breaking that team's ten signatures.
 * - Not the league's last admin.
 * - Not a banned player. The ban lives on the player document, so deleting
 *   it would let them sign up again, unbanned, with the same email. An admin
 *   can still delete the account from the Firebase console.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, type SeasonDocument } from '../../../types.js'
import { validateBasicAuthentication } from '../../../shared/auth.js'
import { getCurrentSeason, playerSeasonRef } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { deletePlayerAccountData } from '../../../services/accountDeletionService.js'

/** How recently the caller must have signed in to delete their account. */
const RECENT_SIGN_IN_SECONDS = 5 * 60

export interface DeletePlayerResponse {
	success: true
	message: string
}

export const deletePlayer = onCall(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeletePlayerResponse> => {
		validateBasicAuthentication(request.auth)
		const uid = request.auth.uid
		const firestore = getFirestore()

		const signedInAt = Number(request.auth.token.auth_time)
		if (
			!Number.isFinite(signedInAt) ||
			Date.now() / 1000 - signedInAt > RECENT_SIGN_IN_SECONDS
		) {
			throw new HttpsError(
				'failed-precondition',
				'For your security, confirm your password again to delete your account.'
			)
		}

		const season = (await getCurrentSeason()) as
			(SeasonDocument & { id: string }) | null
		if (season) {
			const current = await playerSeasonRef(firestore, uid, season.id).get()
			if (current.data()?.team) {
				throw new HttpsError(
					'failed-precondition',
					`Leave your team for ${season.name} before deleting your account.`
				)
			}
		}

		const player = (
			await firestore.collection(Collections.PLAYERS).doc(uid).get()
		).data()
		if (player?.banned === true) {
			throw new HttpsError(
				'failed-precondition',
				'Your account is banned, so it can only be deleted by the league. Email leadership@mplsmallard.com.'
			)
		}
		if (player?.admin === true) {
			const admins = await firestore
				.collection(Collections.PLAYERS)
				.where('admin', '==', true)
				.limit(2)
				.get()
			if (admins.size <= 1) {
				throw new HttpsError(
					'failed-precondition',
					'You are the only admin. Make someone else an admin before deleting your account.'
				)
			}
		}

		// Data first, then the sign-in: if the cleanup fails part way the
		// player can still sign in and try again, and every step is safe to
		// repeat. Deleting the sign-in fires userDeleted, which finds nothing
		// left.
		const summary = await deletePlayerAccountData(firestore, uid)
		try {
			await getAuth().deleteUser(uid)
		} catch (error) {
			// Already gone — a retry after the sign-in was deleted.
			if ((error as { code?: string }).code !== 'auth/user-not-found') {
				throw error
			}
		}

		logger.info('Player deleted their account', { uid, ...summary })
		return { success: true, message: 'Your account has been deleted.' }
	}
)
