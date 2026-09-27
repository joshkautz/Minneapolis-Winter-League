/**
 * Who may read or change a player's email preferences: whoever holds a link
 * from one of their emails (the player id and token), or the player signed
 * in as themselves. The link works without signing in, as CAN-SPAM requires.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { playerContactRef } from '../shared/database.js'
import type { PlayerContactDocument } from '../types.js'
import { tokenMatches } from './unsubscribe.js'

export interface PreferenceLink {
	/** From an email link; omit both when signed in. */
	playerId?: string
	token?: string
}

export interface PreferenceAccess {
	playerId: string
	contact: PlayerContactDocument
}

export async function resolvePreferenceAccess(
	firestore: Firestore,
	auth: CallableRequest['auth'],
	link: PreferenceLink
): Promise<PreferenceAccess> {
	const fromLink = link.playerId !== undefined || link.token !== undefined
	if (fromLink) {
		if (typeof link.playerId !== 'string' || typeof link.token !== 'string') {
			throw invalidLink()
		}
		const contact = (
			await playerContactRef(firestore, link.playerId).get()
		).data()
		if (!contact || !tokenMatches(contact, link.token)) throw invalidLink()
		return { playerId: link.playerId, contact }
	}

	if (!auth?.uid) {
		throw new HttpsError(
			'unauthenticated',
			'Sign in, or use the link in one of your league emails.'
		)
	}
	const contact = (await playerContactRef(firestore, auth.uid).get()).data()
	if (!contact) {
		throw new HttpsError(
			'not-found',
			'Your account has no email address on file yet. Finish setting up your profile first.'
		)
	}
	return { playerId: auth.uid, contact }
}

const invalidLink = (): HttpsError =>
	new HttpsError(
		'permission-denied',
		'This link is not valid. Use the link in your most recent league email, or sign in and change your preferences on your profile.'
	)
