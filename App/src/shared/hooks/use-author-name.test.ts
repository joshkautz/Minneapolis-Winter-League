import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentReference } from 'firebase/firestore'
import type { PlayerDocument } from '@/types'

const useDocumentOnce = vi.fn()
vi.mock('react-firebase-hooks/firestore', () => ({
	useDocumentOnce: (...args: unknown[]) => useDocumentOnce(...args),
}))
const loggerError = vi.fn()
vi.mock('@/shared/utils', () => ({
	logger: { error: (...args: unknown[]) => loggerError(...args) },
}))

const { useAuthorName, AUTHOR_LOADING, AUTHOR_UNKNOWN } =
	await import('./use-author-name')

const author = { path: 'players/p1' } as DocumentReference<PlayerDocument>
const snapshotOf = (data: Partial<PlayerDocument> | undefined) => ({
	data: () => data,
})

beforeEach(() => {
	useDocumentOnce.mockReset()
	loggerError.mockReset()
})

describe('useAuthorName', () => {
	it("shows the author's full name", () => {
		useDocumentOnce.mockReturnValue([
			snapshotOf({ firstname: 'Ada', lastname: 'Lovelace' }),
			false,
			undefined,
		])
		const { result } = renderHook(() => useAuthorName(author, 'Former player'))
		expect(result.current).toBe('Ada Lovelace')
	})

	it('shows the missing name once the author has deleted their account', () => {
		useDocumentOnce.mockReturnValue([snapshotOf(undefined), false, undefined])
		const { result } = renderHook(() => useAuthorName(author, 'Former player'))
		expect(result.current).toBe('Former player')
	})

	it('says it is loading until the document arrives', () => {
		useDocumentOnce.mockReturnValue([undefined, true, undefined])
		const { result } = renderHook(() => useAuthorName(author, 'Former player'))
		expect(result.current).toBe(AUTHOR_LOADING)
	})

	it('logs a failed read and says the author is unknown', () => {
		const error = new Error('permission-denied')
		useDocumentOnce.mockReturnValue([undefined, false, error])
		const { result } = renderHook(() => useAuthorName(author, 'Former player'))
		expect(result.current).toBe(AUTHOR_UNKNOWN)
		expect(loggerError).toHaveBeenCalledWith('Error fetching author', error, {
			path: 'players/p1',
		})
	})
})
