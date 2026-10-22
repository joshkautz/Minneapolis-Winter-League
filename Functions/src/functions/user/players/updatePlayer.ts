/**
 * Update player callable function
 *
 * A player edits their own name and nickname; an admin may edit anyone's
 * through here too, though the admin editor uses `updatePlayerAdmin`.
 *
 * A player's real name is locked once they have signed the current
 * season's waiver: the waiver names them, and a roster has to say who is
 * really playing. Before signing they can still correct it; after, an
 * admin changes it for them. The nickname can always change. Every change
 * is recorded in the player's name history, in the transaction that makes
 * it.
 *
 * Security validations:
 * - User must be authenticated
 * - Users can only update their own profile (unless admin)
 * - Only the first name, last name and nickname can be updated, each
 *   against the shared name rules
 * - A player who has signed the current season's waiver cannot change
 *   their first or last name; an admin can
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type PlayerDocument,
	type SeasonDocument,
} from '../../../types.js'
import {
	validateAdminUser,
	validateBasicAuthentication,
} from '../../../shared/auth.js'
import {
	validateAndNormalizeName,
	validateNickname,
} from '../../../shared/names.js'
import { getCurrentSeason, playerSeasonRef } from '../../../shared/database.js'
import {
	formatPlayerName,
	normalizeTypography,
} from '../../../shared/nameRules.js'
import { nameSnapshot, recordNameChange } from '../../../shared/nameHistory.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'

/**
 * The submitted name, or the stored one when they differ only in what
 * normalizing changes. A name saved before names were normalized — "venice"
 * rather than "Venice" — would otherwise count as changed every time the
 * profile is saved, and lock a signed player out of changing their
 * nickname.
 */
const keepUnlessChanged = (
	submitted: string | undefined,
	stored: string
): string =>
	submitted === undefined ||
	submitted === formatPlayerName(normalizeTypography(stored.trim()))
		? stored
		: submitted

interface UpdatePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	firstname?: string
	lastname?: string
	/** A new nickname, or null or blank to clear it. */
	nickname?: string | null
}

export const updatePlayer = onCall<UpdatePlayerRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		validateBasicAuthentication(auth)

		const { playerId, firstname, lastname, nickname } = data ?? {}
		const userId = auth?.uid ?? ''
		const targetPlayerId = playerId || userId
		const firestore = getFirestore()

		const byAdmin = targetPlayerId !== userId
		if (byAdmin) {
			// Only admins can update other players
			await validateAdminUser(auth, firestore)
		}

		if (
			firstname === undefined &&
			lastname === undefined &&
			nickname === undefined
		) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field must be provided for update'
			)
		}

		// Same rules as the App's form, enforced here because a callable
		// bypasses the form.
		const normalizedFirstname =
			firstname !== undefined
				? validateAndNormalizeName(firstname, 'First name')
				: undefined
		const normalizedLastname =
			lastname !== undefined
				? validateAndNormalizeName(lastname, 'Last name')
				: undefined
		const normalizedNickname =
			nickname !== undefined ? validateNickname(nickname) : undefined

		try {
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)
			const season = (await getCurrentSeason()) as
				(SeasonDocument & { id: string }) | null

			await firestore.runTransaction(async (transaction) => {
				const playerDoc = await transaction.get(playerRef)
				const player = playerDoc.data() as PlayerDocument | undefined
				if (!player) {
					throw new HttpsError('not-found', 'Player not found')
				}

				const before = nameSnapshot(player)
				const after = {
					firstname: keepUnlessChanged(normalizedFirstname, before.firstname),
					lastname: keepUnlessChanged(normalizedLastname, before.lastname),
					nickname:
						normalizedNickname !== undefined
							? normalizedNickname
							: before.nickname,
				}
				const realNameChanges =
					after.firstname !== before.firstname ||
					after.lastname !== before.lastname

				// Read in the transaction, so signing the waiver and changing
				// the name at the same moment cannot both get through.
				if (realNameChanges && !byAdmin && season) {
					const signed =
						(
							await transaction.get(
								playerSeasonRef(firestore, targetPlayerId, season.id)
							)
						).data()?.signed === true
					if (signed) {
						throw new HttpsError(
							'failed-precondition',
							`Your name is on your signed waiver for ${season.name}. To change it, contact the league.`
						)
					}
				}

				transaction.update(playerRef, {
					firstname: after.firstname,
					lastname: after.lastname,
					nickname: after.nickname,
				})
				recordNameChange(
					transaction,
					playerRef,
					before,
					after,
					userId,
					byAdmin ? 'admin' : 'player'
				)
			})

			logger.info(`Successfully updated player: ${targetPlayerId}`, {
				updatedFields: [
					normalizedFirstname !== undefined && 'firstname',
					normalizedLastname !== undefined && 'lastname',
					normalizedNickname !== undefined && 'nickname',
				].filter(Boolean),
				updatedBy: userId,
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player updated successfully',
			}
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'Your profile could not be saved. Please try again.',
				{ targetPlayerId, updatedBy: userId }
			)
		}
	}
)
