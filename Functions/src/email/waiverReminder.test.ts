import { describe, expect, it } from 'vitest'
import { renderEmail } from './render.js'
import { TEMPLATES } from './templates.js'
import {
	nextReminderAt,
	reminderRecipients,
	reminderTimeText,
	waiverReminderEmail,
} from './waiverReminder.js'

const recipient = { recipientFirstName: 'Alex', unsubscribeUrl: null }

describe('reminderRecipients', () => {
	it('is everyone still to sign, but never the captain sending it', () => {
		expect(
			reminderRecipients(
				[
					{ playerId: 'captain', signed: false },
					{ playerId: 'signed', signed: true },
					{ playerId: 'one', signed: false },
					{ playerId: 'two', signed: false },
				],
				'captain'
			)
		).toEqual(['one', 'two'])
	})
})

describe('the cooldown', () => {
	it('opens again a day after the last send', () => {
		expect(nextReminderAt(new Date('2026-10-15T00:42:00Z'))).toEqual(
			new Date('2026-10-16T00:42:00Z')
		)
	})

	it('names the time on Minneapolis’s clock, in either season', () => {
		expect(reminderTimeText(new Date('2026-10-16T00:42:00Z'))).toBe(
			'Thursday at 7:42 PM'
		)
		expect(reminderTimeText(new Date('2026-12-01T15:05:00Z'))).toBe(
			'Tuesday at 9:05 AM'
		)
	})
})

describe('waiverReminderEmail', () => {
	it('keys each reminder on the team, season, player and send', () => {
		const sentAt = new Date('2026-10-16T00:42:00Z')
		expect(
			waiverReminderEmail({
				teamId: 'team-1',
				seasonId: 'season-5',
				playerId: 'player-1',
				sentAt,
				props: TEMPLATES.waiverReminder.sample,
			})
		).toEqual({
			id: `waiverReminder-team-1-season-5-player-1-${sentAt.getTime()}`,
			to: { playerId: 'player-1' },
			template: 'waiverReminder',
			props: TEMPLATES.waiverReminder.sample,
		})
	})
})

describe('the waiver reminder', () => {
	it('can be turned off with the other registration reminders', () => {
		expect(TEMPLATES.waiverReminder.category).toBe('registration')
	})

	it('says who asked, and links to the waiver', async () => {
		const { subject, text } = await renderEmail(
			'waiverReminder',
			TEMPLATES.waiverReminder.sample,
			recipient
		)

		expect(subject).toBe('Sign your Season 5 waiver for Frost Giants')
		expect(text).toContain('Sam Rivera, captain of Frost Giants')
		expect(text).toContain('https://mplswinterleague.com/waiver')
	})

	it('counts the team’s signed players only while it is short of them', async () => {
		const short = await renderEmail(
			'waiverReminder',
			TEMPLATES.waiverReminder.sample,
			recipient
		)
		const registered = await renderEmail(
			'waiverReminder',
			{ ...TEMPLATES.waiverReminder.sample, teamRegistered: true },
			recipient
		)

		expect(short.text).toContain('7 of the 10 signed players')
		expect(registered.text).not.toContain('signed players it needs')
	})
})
