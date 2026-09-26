import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useCollection } = vi.hoisted(() => ({ useCollection: vi.fn() }))
vi.mock('react-firebase-hooks/firestore', () => ({ useCollection }))
vi.mock('@/firebase/collections/players', () => ({
	allPlayerContactsQuery: () => ({ kind: 'contacts' }),
}))
vi.mock('./use-query-error-handler', () => ({ useQueryErrorHandler: vi.fn() }))

const { usePlayerEmails } = await import('./use-player-emails')

describe('usePlayerEmails', () => {
	beforeEach(() => {
		useCollection.mockReset()
	})

	it('maps each player id to their email', () => {
		useCollection.mockReturnValue([
			{
				docs: [
					{ id: 'p1', data: () => ({ email: 'one@example.com' }) },
					{ id: 'p2', data: () => ({ email: 'two@example.com' }) },
				],
			},
			false,
			undefined,
		])
		const { result } = renderHook(() => usePlayerEmails('Test'))

		expect(result.current.emails.get('p2')).toBe('two@example.com')
		expect(result.current.emails.size).toBe(2)
	})
})
