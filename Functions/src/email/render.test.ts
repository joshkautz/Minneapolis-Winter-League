import { describe, expect, it } from 'vitest'
import { EMAIL_CONFIG } from '../config/constants.js'
import { renderEmail } from './render.js'
import { TEMPLATES, type TemplateName } from './templates.js'

const UNSUBSCRIBE =
	'https://mplswinterleague.com/email-preferences?p=a&t=b&c=announcements'

const render = (name: TemplateName) =>
	renderEmail(name, TEMPLATES[name].sample as never, {
		recipientFirstName: 'Josh',
		unsubscribeUrl: UNSUBSCRIBE,
	})

describe('renderEmail', () => {
	it.each(Object.keys(TEMPLATES) as TemplateName[])(
		'renders %s as HTML and plain text with a subject',
		async (name) => {
			const email = await render(name)
			expect(email.subject.length).toBeGreaterThan(0)
			expect(email.html).toContain('<html')
			expect(email.html).toContain('mpls-logo-default.png')
			expect(email.text.length).toBeGreaterThan(0)
			expect(email.text).not.toContain('<')
		}
	)

	it.each(Object.keys(TEMPLATES) as TemplateName[])(
		'opens the plain text of %s with its words, not the logo’s link',
		async (name) => {
			// The logo is a link to the site. Its image is dropped from the
			// text version, which left the bare address as the first line.
			const { text } = await render(name)
			expect(text.trimStart()).not.toMatch(/^https?:/)
		}
	)

	it('builds the announcement from its season', async () => {
		const email = await render('seasonAnnouncement')
		expect(email.subject).toBe(
			'Season 5 registration opens Thursday, October 1'
		)
		expect(email.text).toContain('Season 5 is almost here')
		expect(email.text).toContain('Hi Josh,')
		// The fee is left for the site, where players see it in context.
		expect(email.text).toContain('each team pays one fee')
		expect(email.text).not.toMatch(/\$\d/)
		expect(email.html).not.toMatch(/\$\d/)
		expect(email.text).toContain(
			'Saturdays from 6:00pm: November 7, 14 and 21, and December 5, 12 and 19. No games Thanksgiving weekend.'
		)
		// The venue links to the same map as the home page.
		expect(email.html).toContain(
			'href="https://maps.app.goo.gl/avAamyReCbGmz8jWA"'
		)
		expect(email.text).toContain(
			'URW Sports Field Complex https://maps.app.goo.gl/avAamyReCbGmz8jWA'
		)
		// Teams form before registration, which is when they pay.
		expect(email.text).toContain('start building your team today')
		expect(email.text).toContain(
			'Registration, when teams pay, opens Thursday, October 1'
		)
		expect(email.category).toBe('announcements')
	})

	it('offers a visible Unsubscribe link in email a player can turn off', async () => {
		const email = await render('seasonAnnouncement')
		expect(email.html).toContain(UNSUBSCRIBE.replaceAll('&', '&amp;'))
		expect(email.html).toMatch(/Don(’|'|&#x27;|&apos;)t want these emails\?/)
		expect(email.text).toMatch(/Unsubscribe/)
		expect(email.text).toContain(UNSUBSCRIBE)
	})

	it('carries the league’s postal address in announcements, as CAN-SPAM requires', async () => {
		expect((await render('seasonAnnouncement')).text).toContain(
			'4316 Glencrest Road, Golden Valley, MN 55416'
		)
	})

	it('never offers one in account email', async () => {
		expect((await render('testEmail')).html).not.toContain('Unsubscribe')
	})

	it('prints the postal address in announcements only', async () => {
		const config = EMAIL_CONFIG as { POSTAL_ADDRESS: string | null }
		const saved = config.POSTAL_ADDRESS
		config.POSTAL_ADDRESS = 'PO Box 1, Minneapolis, MN 55401'
		try {
			expect((await render('seasonAnnouncement')).text).toContain('PO Box 1')
			expect((await render('testEmail')).text).not.toContain('PO Box 1')
		} finally {
			config.POSTAL_ADDRESS = saved
		}
	})
})
