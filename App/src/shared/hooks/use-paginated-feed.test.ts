import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

/**
 * The feed shows a live first page and fetches later pages as the reader
 * scrolls. These pin the page arithmetic, and that a new first page — a new
 * item, or another season — starts the feed over.
 */

interface FakeQuery {
	season: string
	after?: string
}

const { getDocs, useCollection, loggerError, toastError } = vi.hoisted(() => ({
	getDocs: vi.fn(),
	useCollection: vi.fn(),
	loggerError: vi.fn(),
	toastError: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
	getDocs,
	queryEqual: (a: FakeQuery, b: FakeQuery) =>
		a.season === b.season && a.after === b.after,
}))
vi.mock('react-firebase-hooks/firestore', () => ({ useCollection }))
vi.mock('@/shared/utils', () => ({ logger: { error: loggerError } }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

let observerCallback: IntersectionObserverCallback = () => {}
vi.stubGlobal(
	'IntersectionObserver',
	class {
		constructor(callback: IntersectionObserverCallback) {
			observerCallback = callback
		}
		observe() {}
		disconnect() {}
	}
)

const { usePaginatedFeed } = await import('./use-paginated-feed')

const PAGE_SIZE = 2

const doc = (id: string) => ({ id, data: () => ({ title: id }) })
const page = (query: FakeQuery, ids: string[]) => ({
	query,
	docs: ids.map(doc),
})

const pageQuery =
	(season: string) =>
	(after?: { id: string }): FakeQuery => ({ season, after: after?.id })

const scrollToEnd = async () => {
	await act(async () => {
		observerCallback(
			[{ isIntersecting: true } as IntersectionObserverEntry],
			{} as IntersectionObserver
		)
	})
}

const render = (season: string | null) =>
	renderHook(
		({ season }) =>
			usePaginatedFeed({
				pageQuery: season
					? (pageQuery(season) as unknown as Parameters<
							typeof usePaginatedFeed
						>[0]['pageQuery'])
					: null,
				pageSize: PAGE_SIZE,
				component: 'Feed',
				errorLabel: 'items',
			}),
		{ initialProps: { season } }
	)

const titles = (items: { data: unknown }[]) =>
	items.map((item) => (item.data as { title: string }).title)

beforeEach(() => {
	vi.clearAllMocks()
})

describe('usePaginatedFeed', () => {
	it('shows the first page, with more to come when it is full', () => {
		useCollection.mockReturnValue([
			page({ season: 's1' }, ['a', 'b']),
			false,
			undefined,
		])
		const { result } = render('s1')
		expect(titles(result.current.items)).toEqual(['a', 'b'])
		expect(result.current.hasMore).toBe(true)
		expect(result.current.loading).toBe(false)
	})

	it('has nothing more when the first page is short', () => {
		useCollection.mockReturnValue([
			page({ season: 's1' }, ['a']),
			false,
			undefined,
		])
		const { result } = render('s1')
		expect(result.current.hasMore).toBe(false)
	})

	it('appends the next page after the last item, until a short page', async () => {
		const first = page({ season: 's1' }, ['a', 'b'])
		useCollection.mockReturnValue([first, false, undefined])
		getDocs
			.mockResolvedValueOnce(page({ season: 's1', after: 'b' }, ['c', 'd']))
			.mockResolvedValueOnce(page({ season: 's1', after: 'd' }, ['e']))
		const { result } = render('s1')

		await scrollToEnd()
		expect(getDocs).toHaveBeenLastCalledWith({ season: 's1', after: 'b' })
		expect(titles(result.current.items)).toEqual(['a', 'b', 'c', 'd'])
		expect(result.current.hasMore).toBe(true)

		await scrollToEnd()
		expect(getDocs).toHaveBeenLastCalledWith({ season: 's1', after: 'd' })
		expect(titles(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e'])
		expect(result.current.hasMore).toBe(false)
	})

	it('starts over when the live first page changes', async () => {
		useCollection.mockReturnValue([
			page({ season: 's1' }, ['a', 'b']),
			false,
			undefined,
		])
		getDocs.mockResolvedValueOnce(page({ season: 's1', after: 'b' }, ['c']))
		const { result, rerender } = render('s1')
		await scrollToEnd()
		expect(titles(result.current.items)).toEqual(['a', 'b', 'c'])

		useCollection.mockReturnValue([
			page({ season: 's1' }, ['new', 'a']),
			false,
			undefined,
		])
		rerender({ season: 's1' })
		expect(titles(result.current.items)).toEqual(['new', 'a'])
		expect(result.current.hasMore).toBe(true)
	})

	it("never shows the last season's items while the next season loads", () => {
		useCollection.mockReturnValue([
			page({ season: 's1' }, ['a', 'b']),
			false,
			undefined,
		])
		const { result, rerender } = render('s1')

		// The render a query changes on, useCollection still holds the old one.
		rerender({ season: 's2' })
		expect(result.current.items).toEqual([])
		expect(result.current.loading).toBe(true)
	})

	it('is empty and not loading before it can be queried', () => {
		useCollection.mockReturnValue([undefined, false, undefined])
		const { result } = render(null)
		expect(result.current.items).toEqual([])
		expect(result.current.loading).toBe(false)
		expect(result.current.hasMore).toBe(false)
	})

	it('logs a failed later page and keeps what it has', async () => {
		const failure = new Error('unavailable')
		useCollection.mockReturnValue([
			page({ season: 's1' }, ['a', 'b']),
			false,
			undefined,
		])
		getDocs.mockRejectedValueOnce(failure)
		const { result } = render('s1')

		await scrollToEnd()
		await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
		expect(loggerError).toHaveBeenCalledWith(
			'Failed to load more items',
			failure,
			{ component: 'Feed' }
		)
		expect(titles(result.current.items)).toEqual(['a', 'b'])
	})

	it('reports a first-page error through the query error handler', () => {
		const failure = new Error('permission-denied')
		useCollection.mockReturnValue([undefined, false, failure])
		const { result } = render('s1')
		expect(result.current.error).toBe(failure)
		expect(result.current.loading).toBe(false)
		expect(toastError).toHaveBeenCalledWith('Failed to load items', {
			description: 'permission-denied',
		})
	})
})
