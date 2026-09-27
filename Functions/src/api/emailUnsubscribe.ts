/**
 * Unsubscribe page, served at mplswinterleague.com/unsubscribe (a Hosting
 * rewrite in firebase.json).
 *
 * - GET, from the link in an email, shows a page with a button. It does not
 *   unsubscribe by itself: mail security scanners open every link in a
 *   message, and would otherwise unsubscribe people who never clicked.
 * - POST unsubscribes: the page's button, and the one-click unsubscribe mail
 *   apps send from the List-Unsubscribe header (RFC 8058).
 *
 * The link proves itself with the player's token; see email/unsubscribe.ts.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { EMAIL_CONFIG, FIREBASE_CONFIG } from '../config/constants.js'
import { applyUnsubscribe, isOptionalCategory } from '../email/unsubscribe.js'
import { COLORS, FONT_STACK, LOGO, RADIUS } from '../email/templates/theme.js'
import type { OptionalEmailCategory } from '../types.js'

const CATEGORY_NAMES: Record<OptionalEmailCategory, string> = {
	announcements: 'league announcements',
	registration: 'registration reminders',
	teams: 'team notifications',
}

const escapeHtml = (value: string): string =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				char
			] ?? char
	)

/** A small page in the site's style. */
const page = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Minneapolis Winter League</title></head>
<body style="margin:0;background:${COLORS.background};font-family:${FONT_STACK};color:${COLORS.navy}">
<main style="max-width:480px;margin:48px auto;padding:0 16px;text-align:center">
<a href="${EMAIL_CONFIG.SITE_URL}"><img src="${LOGO.src}" width="${LOGO.width}" height="${LOGO.height}" alt="Minneapolis Winter League"></a>
<div style="margin-top:24px;background:${COLORS.card};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.sky};border-radius:${RADIUS};padding:32px">
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>
${body}
</div></main></body></html>`

const paragraph = (text: string): string =>
	`<p style="font-size:16px;line-height:1.6;margin:0 0 16px">${text}</p>`

export const emailUnsubscribe = onRequest(
	{ region: FIREBASE_CONFIG.REGION },
	async (request, response) => {
		const source =
			request.method === 'POST'
				? { ...request.query, ...request.body }
				: request.query
		const playerId = typeof source.p === 'string' ? source.p : ''
		const token = typeof source.t === 'string' ? source.t : ''
		const category = source.c

		response.set('Cache-Control', 'no-store')

		if (!playerId || !token || !isOptionalCategory(category)) {
			response
				.status(400)
				.send(
					page(
						'This link is not valid',
						paragraph(
							'It may have been copied incompletely. Use the unsubscribe link in the email itself.'
						)
					)
				)
			return
		}
		const what = CATEGORY_NAMES[category]

		if (request.method === 'GET') {
			const action = `/unsubscribe?${new URLSearchParams({ p: playerId, t: token, c: category })}`
			response.send(
				page(
					`Unsubscribe from ${what}?`,
					paragraph(`You will no longer receive ${what} by email.`) +
						`<form method="post" action="${escapeHtml(action)}"><button type="submit" style="background:${COLORS.navy};color:${COLORS.onNavy};border:0;border-radius:${RADIUS};padding:12px 24px;font-size:16px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`
				)
			)
			return
		}
		if (request.method !== 'POST') {
			response.status(405).set('Allow', 'GET, POST').send('Method not allowed')
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
					.send(
						page(
							'This link is not valid',
							paragraph(
								'It does not match your account. Use the unsubscribe link in the most recent email.'
							)
						)
					)
				return
			}
			response.send(
				page(
					'You are unsubscribed',
					paragraph(`You will no longer receive ${what} by email.`) +
						paragraph(
							`Changed your mind? Email <a href="mailto:${EMAIL_CONFIG.REPLY_TO}" style="color:${COLORS.navy}">${EMAIL_CONFIG.REPLY_TO}</a>.`
						)
				)
			)
		} catch (error) {
			logger.error('Unsubscribe failed', { playerId, category, error })
			response
				.status(500)
				.send(
					page(
						'Something went wrong',
						paragraph(
							`You are not unsubscribed yet. Please try again, or email ${EMAIL_CONFIG.REPLY_TO}.`
						)
					)
				)
		}
	}
)
