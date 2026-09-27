/**
 * One-click unsubscribe, served at mplswinterleague.com/unsubscribe (a
 * Hosting rewrite in firebase.json). This is the `List-Unsubscribe` header's
 * target, for mail apps; people use the preferences page the footer links to.
 *
 * - POST unsubscribes (RFC 8058). The player, token and category come from
 *   the URL alone: mail apps send the body `List-Unsubscribe=One-Click` as
 *   form data or multipart, and no cookies or credentials. The answer is a
 *   plain 200, never a redirect, which RFC 8058 forbids here.
 * - GET is a mail app opening the address in a browser instead. It changes
 *   nothing — link scanners fetch every URL in a message — and redirects to
 *   the preferences page, where the person can choose.
 *
 * The link proves itself with the player's token; see email/unsubscribe.ts.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { EMAIL_CONFIG, FIREBASE_CONFIG } from '../config/constants.js'
import { applyUnsubscribe, isOptionalCategory } from '../email/unsubscribe.js'

const single = (value: unknown): string =>
	typeof value === 'string' ? value : ''

export const emailUnsubscribe = onRequest(
	{ region: FIREBASE_CONFIG.REGION },
	async (request, response) => {
		response.set('Cache-Control', 'no-store')
		const playerId = single(request.query.p)
		const token = single(request.query.t)
		const category = request.query.c

		if (request.method === 'GET' || request.method === 'HEAD') {
			const query = new URLSearchParams({
				p: playerId,
				t: token,
				c: typeof category === 'string' ? category : '',
			})
			response.redirect(
				303,
				`${EMAIL_CONFIG.SITE_URL}/email-preferences?${query}`
			)
			return
		}
		if (request.method !== 'POST') {
			response.status(405).set('Allow', 'GET, POST').send('Method not allowed')
			return
		}
		if (!playerId || !token || !isOptionalCategory(category)) {
			response.status(400).type('text/plain').send('Invalid unsubscribe link.')
			return
		}

		try {
			const done = await applyUnsubscribe(getFirestore(), {
				playerId,
				token,
				category,
			})
			if (!done) {
				response
					.status(400)
					.type('text/plain')
					.send('Invalid unsubscribe link.')
				return
			}
			logger.info('One-click unsubscribe', { playerId, category })
			response.status(200).type('text/plain').send('You are unsubscribed.')
		} catch (error) {
			logger.error('One-click unsubscribe failed', {
				playerId,
				category,
				error,
			})
			response
				.status(500)
				.type('text/plain')
				.send('Could not unsubscribe. Please try again.')
		}
	}
)
