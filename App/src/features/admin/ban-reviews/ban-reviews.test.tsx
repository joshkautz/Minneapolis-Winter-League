import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'

/**
 * The admin's list of players flagged as possibly a banned player under a
 * new account: what each resembles and why, and the two decisions.
 */

const { resolveBanReviewViaFunction, toastSuccess } = vi.hoisted(() => ({
	resolveBanReviewViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	resolveBanReviewViaFunction,
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

let reviews: Record<string, unknown>[] = []
vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: () => [
		{ docs: reviews.map((data, i) => ({ id: `r${i}`, data: () => data })) },
		false,
		undefined,
	],
}))

// The page header reads the seasons context.
vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		seasonsQuerySnapshot: { docs: [] },
		seasonsQuerySnapshotLoading: false,
		seasonsQuerySnapshotError: undefined,
		currentSeasonQueryDocumentSnapshot: undefined,
	}),
}))

const { BanReviews } = await import('./ban-reviews')

const renderPage = () =>
	render(
		<MemoryRouter>
			<BanReviews />
		</MemoryRouter>
	)

beforeEach(() => {
	vi.clearAllMocks()
	resolveBanReviewViaFunction.mockResolvedValue({ status: 'banned' })
	reviews = [
		{
			playerId: 'new-1',
			playerName: 'Aidenn Lomen',
			status: 'open',
			flaggedAt: Timestamp.fromDate(new Date('2026-10-28T14:06:21Z')),
			matches: [
				{
					bannedPlayerId: 'banned-1',
					bannedPlayerName: 'Aiden Lomen',
					signals: ['last name', 'date of birth', 'mailing address'],
				},
			],
		},
	]
})

describe('BanReviews', () => {
	it('says who each flagged player resembles, and why', () => {
		renderPage()

		expect(screen.getByRole('link', { name: 'Aidenn Lomen' })).toHaveAttribute(
			'href',
			'/players/new-1'
		)
		expect(screen.getByRole('link', { name: 'Aiden Lomen' })).toHaveAttribute(
			'href',
			'/players/banned-1'
		)
		expect(
			screen.getByText(/same last name, date of birth and mailing address\./)
		).toBeTruthy()
	})

	it('bans the account once the admin confirms', async () => {
		renderPage()

		await userEvent.click(
			screen.getByRole('button', { name: 'Ban this account' })
		)
		expect(resolveBanReviewViaFunction).not.toHaveBeenCalled()
		await userEvent.click(screen.getByRole('button', { name: 'Ban' }))

		expect(resolveBanReviewViaFunction).toHaveBeenCalledWith({
			playerId: 'new-1',
			decision: 'ban',
		})
		expect(toastSuccess).toHaveBeenCalledWith('Aidenn Lomen is banned')
	})

	it('marks the player as someone else', async () => {
		resolveBanReviewViaFunction.mockResolvedValue({ status: 'dismissed' })
		renderPage()

		await userEvent.click(
			screen.getByRole('button', { name: 'Not the same person' })
		)

		expect(resolveBanReviewViaFunction).toHaveBeenCalledWith({
			playerId: 'new-1',
			decision: 'dismiss',
		})
	})

	it('says when there is nothing to review', () => {
		reviews = []
		renderPage()

		expect(screen.getByText(/Nothing to review/)).toBeTruthy()
	})
})
