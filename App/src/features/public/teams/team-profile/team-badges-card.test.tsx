import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DocumentReference } from 'firebase/firestore'
import type { TeamDocument } from '@/types'
import { BADGES } from '@/shared/badges'

/**
 * The team page's badges: every badge in the catalog, earned ones first,
 * with how many seasons each was earned in and how.
 */

const awards = [
	{
		badgeId: 'hot-streak',
		seasonId: 'fall',
		reason: 'Won 5 in a row, through November 21.',
	},
	{
		badgeId: 'hot-streak',
		seasonId: 'spring',
		reason: 'Won 5 in a row, through March 28.',
	},
	{
		badgeId: 'champions',
		seasonId: 'fall',
		reason: 'Won the 2026 Fall championship.',
	},
]

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: (query: { kind: string } | undefined) => {
		if (!query) return [undefined, false, undefined]
		const docs =
			query.kind === 'awards'
				? awards.map((award) => ({
						id: `${award.badgeId}_${award.seasonId}`,
						data: () => award,
					}))
				: [
						{
							id: 'hot-streak',
							data: () => ({ teamsEarned: 5, timesEarned: 9 }),
						},
					]
		return [{ docs }, false, undefined]
	},
}))

vi.mock('@/firebase/collections/badges', () => ({
	teamBadgesQuery: (teamRef: unknown) =>
		teamRef ? { kind: 'awards' } : undefined,
	badgeStatsQuery: () => ({ kind: 'stats' }),
}))

vi.mock('@/firebase/collections/teams', () => ({ allTeamsQuery: () => ({}) }))

vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	getCountFromServer: async () => ({ data: () => ({ count: 20 }) }),
}))

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		seasonsQuerySnapshot: {
			docs: [
				{ id: 'fall', data: () => ({ name: '2026 Fall' }) },
				{ id: 'spring', data: () => ({ name: '2027 Spring' }) },
			],
		},
	}),
}))

vi.mock('@/shared/hooks', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/shared/hooks')>()),
	useIsMobile: () => false,
}))

const { TeamBadgesCard } = await import('./team-badges-card')

const teamRef = { id: 'team-1' } as DocumentReference<TeamDocument>

describe('TeamBadgesCard', () => {
	it('counts the badges earned out of every badge', async () => {
		render(<TeamBadgesCard teamRef={teamRef} />)
		expect(
			await screen.findByText(`2 of ${BADGES.length} earned`)
		).toBeInTheDocument()
	})

	it('lists earned badges first, with how many times', async () => {
		render(<TeamBadgesCard teamRef={teamRef} />)
		const buttons = await screen.findAllByRole('button')

		expect(buttons[0]).toHaveAccessibleName(
			'Champions, earned once. Show details.'
		)
		expect(buttons[1]).toHaveAccessibleName(
			'Hot Streak, earned 2 times. Show details.'
		)
		expect(screen.getByText('×2')).toBeInTheDocument()
		expect(
			screen.getByRole('button', {
				name: 'Dynasty, not earned yet. Show details.',
			})
		).toBeInTheDocument()
	})

	it('shows each season it was earned in, how, and the share of teams', async () => {
		const user = userEvent.setup()
		render(<TeamBadgesCard teamRef={teamRef} />)

		await user.click(await screen.findByRole('button', { name: /^Hot Streak/ }))

		expect(await screen.findByText('2027 Spring')).toBeInTheDocument()
		expect(
			screen.getByText(/Won 5 in a row, through March 28\./)
		).toBeInTheDocument()
		expect(screen.getByText('25% of teams have earned it')).toBeInTheDocument()
	})
})
