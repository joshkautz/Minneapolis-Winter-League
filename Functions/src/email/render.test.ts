import { describe, expect, it } from 'vitest'
import { EMAIL_CONFIG } from '../config/constants.js'
import { renderEmail } from './render.js'
import { TEMPLATES, type TemplateName } from './templates.js'

const UNSUBSCRIBE =
	'https://mplswinterleague.com/unsubscribe?p=a&t=b&c=announcements'

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

	it('builds the announcement from its season', async () => {
		const email = await render('seasonAnnouncement')
		expect(email.subject).toBe(
			'2026 Fall registration opens Thursday, October 1'
		)
		expect(email.text).toContain('Hi Josh,')
		expect(email.text).toContain('$1,000')
		expect(email.category).toBe('announcements')
	})

	it('offers an unsubscribe link in email a player can turn off', async () => {
		expect((await render('seasonAnnouncement')).html).toContain(
			UNSUBSCRIBE.replaceAll('&', '&amp;')
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
