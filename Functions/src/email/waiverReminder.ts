/**
 * Waiver reminders a captain sends to the teammates who have not signed:
 * who gets one, how often a team may send them, and the email itself.
 */

import { FIREBASE_CONFIG } from '../config/constants.js'
import { WAIVER_REMINDER_COOLDOWN_MS } from '../waiver/rules.js'
import type { QueuedEmail } from './outbox.js'
import type { WaiverReminderProps } from './templates/WaiverReminder.js'

/** When a team that last sent reminders at `sentAt` may send again. */
export const nextReminderAt = (sentAt: Date): Date =>
	new Date(sentAt.getTime() + WAIVER_REMINDER_COOLDOWN_MS)

/** "Thursday at 7:42 PM", on Minneapolis's clock: always within a week. */
export const reminderTimeText = (date: Date): string => {
	const part = (options: Intl.DateTimeFormatOptions): string =>
		new Intl.DateTimeFormat('en-US', {
			...options,
			timeZone: FIREBASE_CONFIG.TIME_ZONE,
		}).format(date)
	return `${part({ weekday: 'long' })} at ${part({ hour: 'numeric', minute: '2-digit' })}`
}

/** A player on the roster, as the reminder needs them. */
export interface RosterMember {
	playerId: string
	signed: boolean
}

/** Everyone on the roster still to sign, except the captain sending it. */
export const reminderRecipients = (
	roster: readonly RosterMember[],
	captainId: string
): string[] =>
	roster
		.filter((member) => !member.signed && member.playerId !== captainId)
		.map((member) => member.playerId)

/**
 * One reminder. Keyed on the team, season, player and send time, so a
 * retried transaction cannot queue it twice.
 */
export const waiverReminderEmail = ({
	teamId,
	seasonId,
	playerId,
	sentAt,
	props,
}: {
	teamId: string
	seasonId: string
	playerId: string
	sentAt: Date
	props: WaiverReminderProps
}): QueuedEmail<'waiverReminder'> & { id: string } => ({
	id: `waiverReminder-${teamId}-${seasonId}-${playerId}-${sentAt.getTime()}`,
	to: { playerId },
	template: 'waiverReminder',
	props,
})
