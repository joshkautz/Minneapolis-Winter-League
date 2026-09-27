import type { OptionalEmailCategory } from '@/types'

/** The kinds of email a player can turn off, in the order they are shown. */
export const EMAIL_CATEGORIES: readonly {
	category: OptionalEmailCategory
	label: string
	description: string
}[] = [
	{
		category: 'announcements',
		label: 'League announcements',
		description: 'New seasons, registration opening, and league news.',
	},
	{
		category: 'registration',
		label: 'Registration reminders',
		description:
			'Deadlines, waiver reminders, and how your team is doing toward registering.',
	},
	{
		category: 'teams',
		label: 'Team updates',
		description: 'Invitations, requests to join, and changes to your roster.',
	},
]

export const isOptionalEmailCategory = (
	value: unknown
): value is OptionalEmailCategory =>
	EMAIL_CATEGORIES.some(({ category }) => category === value)

export const categoryLabel = (category: OptionalEmailCategory): string =>
	EMAIL_CATEGORIES.find((entry) => entry.category === category)?.label ??
	category
