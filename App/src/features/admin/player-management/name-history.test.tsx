import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'

/**
 * The admin's view of a player's name history: each change, newest first,
 * with what the name was, who changed it and what it became.
 */

const name = (
	firstname: string,
	lastname: string,
	nickname: string | null
) => ({
	firstname,
	lastname,
	nickname,
})
let entries: Record<string, unknown>[] = []

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: () => [
		{ docs: entries.map((data, i) => ({ id: `e${i}`, data: () => data })) },
		false,
		undefined,
	],
}))
vi.mock('@/shared/hooks', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/shared/hooks')>()),
	useAuthorName: () => 'Ada Min',
	useQueryErrorHandler: () => {},
}))

const { NameHistory } = await import('./name-history')

describe('NameHistory', () => {
	it('lists each change with who made it', () => {
		entries = [
			{
				before: name('Zheng', 'Of Addie', null),
				after: name('John', 'Lei', null),
				changedBy: 'admin-1',
				source: 'admin',
				changedAt: Timestamp.fromDate(new Date('2026-10-22T18:00:00Z')),
			},
			{
				before: name('John', 'Lei', null),
				after: name('Zheng', 'Of Addie', null),
				changedBy: 'player-1',
				source: 'player',
				changedAt: Timestamp.fromDate(new Date('2026-10-04T18:13:00Z')),
			},
			{
				before: null,
				after: name('John', 'Lei', null),
				changedBy: 'player-1',
				source: 'signup',
				changedAt: Timestamp.fromDate(new Date('2025-10-01T16:36:00Z')),
			},
		]
		render(<NameHistory playerId='player-1' />)

		const items = within(screen.getByRole('list', { name: 'Name history' }))
			.getAllByRole('listitem')
			.map((item) => item.textContent?.replace(/\s+/g, ' '))
		expect(items[0]).toContain('Zheng Of Addie Ada Min changed it to John Lei')
		expect(items[1]).toContain(
			'John Lei the player changed it to Zheng Of Addie'
		)
		expect(items[2]).toContain('signed up as John Lei')
	})

	it('says where to look when nothing is recorded', () => {
		entries = []
		render(<NameHistory playerId='player-1' />)

		expect(screen.getByText(/No changes recorded/)).toBeTruthy()
	})
})
