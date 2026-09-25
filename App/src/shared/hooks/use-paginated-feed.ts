import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import {
	getDocs,
	queryEqual,
	type DocumentSnapshot,
	type Query,
	type QueryDocumentSnapshot,
	type QuerySnapshot,
} from 'firebase/firestore'
import { logger } from '@/shared/utils'
import { useQueryErrorHandler } from './use-query-error-handler'

interface UsePaginatedFeedOptions<T> {
	/**
	 * Builds the query for one page: the first page when `after` is
	 * undefined, otherwise the page after that document. Null until the feed
	 * can be queried (before a season is selected, say).
	 */
	pageQuery: ((after?: DocumentSnapshot<T>) => Query<T>) | null
	/** The page size `pageQuery` limits to; a shorter page is the last one. */
	pageSize: number
	/** Component name for logging context. */
	component: string
	/** What the feed holds, for error messages ("news", "posts"). */
	errorLabel: string
}

export interface PaginatedFeed<T> {
	items: { id: string; data: T }[]
	loading: boolean
	error: Error | undefined
	hasMore: boolean
	isLoadingMore: boolean
	/**
	 * Attach to an element after the last item. The next page loads when it
	 * scrolls into view.
	 */
	sentinelRef: React.RefObject<HTMLDivElement | null>
}

/** The pages fetched after the first, and the first page they follow. */
interface LaterPages<T> {
	after: QuerySnapshot<T>
	docs: QueryDocumentSnapshot<T>[]
	exhausted: boolean
}

/**
 * An infinitely scrolling Firestore feed: the first page is live, and later
 * pages are fetched once each as the reader scrolls.
 *
 * Later pages are stored with the first-page snapshot they follow and shown
 * only while that snapshot is current. A new item, or a new season, gives a
 * new first page and so starts the feed over, without an effect copying
 * snapshots into state.
 */
export const usePaginatedFeed = <T>({
	pageQuery,
	pageSize,
	component,
	errorLabel,
}: UsePaginatedFeedOptions<T>): PaginatedFeed<T> => {
	const firstPageQuery = pageQuery ? pageQuery() : null
	const [snapshot, snapshotLoading, error] = useCollection(firstPageQuery)
	useQueryErrorHandler({ error, component, errorLabel })

	// On the render a query changes, useCollection still holds the old
	// query's snapshot. Ignoring it keeps the previous season's items from
	// flashing on screen before the new ones load.
	const firstPage =
		snapshot && firstPageQuery && queryEqual(snapshot.query, firstPageQuery)
			? snapshot
			: undefined
	const loading =
		snapshotLoading || (firstPageQuery !== null && !firstPage && !error)

	const [laterPages, setLaterPages] = useState<LaterPages<T> | null>(null)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const loadingMoreRef = useRef(false)
	const sentinelRef = useRef<HTMLDivElement>(null)

	const currentLaterPages =
		laterPages && laterPages.after === firstPage ? laterPages : null
	const docs = useMemo(
		() => [...(firstPage?.docs ?? []), ...(currentLaterPages?.docs ?? [])],
		[firstPage, currentLaterPages]
	)
	const hasMore = currentLaterPages
		? !currentLaterPages.exhausted
		: firstPage?.docs.length === pageSize

	const pageQueryRef = useRef(pageQuery)
	useEffect(() => {
		pageQueryRef.current = pageQuery
	})

	const loadMore = useCallback(async () => {
		const buildQuery = pageQueryRef.current
		const lastDoc = docs[docs.length - 1]
		if (!buildQuery || !firstPage || !lastDoc || !hasMore) return
		if (loadingMoreRef.current) return
		loadingMoreRef.current = true
		setIsLoadingMore(true)
		try {
			const nextPage = await getDocs(buildQuery(lastDoc))
			setLaterPages((previous) => ({
				after: firstPage,
				docs: [
					...(previous?.after === firstPage ? previous.docs : []),
					...nextPage.docs,
				],
				exhausted: nextPage.docs.length < pageSize,
			}))
		} catch (loadError) {
			logger.error(`Failed to load more ${errorLabel}`, loadError, {
				component,
			})
		} finally {
			loadingMoreRef.current = false
			setIsLoadingMore(false)
		}
	}, [docs, firstPage, hasMore, pageSize, errorLabel, component])

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
					void loadMore()
				}
			},
			{ threshold: 0.1 }
		)
		const sentinel = sentinelRef.current
		if (sentinel) observer.observe(sentinel)
		return () => observer.disconnect()
	}, [hasMore, isLoadingMore, loadMore])

	const items = useMemo(
		() => docs.map((doc) => ({ id: doc.id, data: doc.data() })),
		[docs]
	)

	return { items, loading, error, hasMore, isLoadingMore, sentinelRef }
}
