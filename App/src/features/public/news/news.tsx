import { useState, useEffect, useCallback, useRef } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { getDocs, type DocumentSnapshot } from 'firebase/firestore'
import { Newspaper } from 'lucide-react'
import { useSeasonsContext } from '@/providers'
import { newsQueryBySeason } from '@/firebase/collections/news'
import { NewsDocument } from '@/types'
import { PageContainer, PageHeader, LoadingSpinner } from '@/shared/components'
import { logger } from '@/shared/utils'
import { NewsCard } from './news-card'
import { NewsEmptyState } from './news-empty-state'

const NEWS_PAGE_SIZE = 10

/**
 * News page component
 * Displays published news posts for the current season with infinite scroll
 */
export const News = () => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const [allPosts, setAllPosts] = useState<
		Array<{ id: string; data: NewsDocument }>
	>([])
	const [lastDoc, setLastDoc] = useState<
		DocumentSnapshot<NewsDocument> | undefined
	>(undefined)
	const [hasMore, setHasMore] = useState(true)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const observerTarget = useRef<HTMLDivElement>(null)

	// Initial query for first page
	const initialQuery = selectedSeasonQueryDocumentSnapshot
		? newsQueryBySeason(selectedSeasonQueryDocumentSnapshot.ref, NEWS_PAGE_SIZE)
		: null

	const [snapshot, loading, error] = useCollection(initialQuery)

	// Log and notify on query errors
	useEffect(() => {
		if (error) {
			logger.error('Failed to load news:', {
				component: 'News',
				error: error.message,
			})
			toast.error('Failed to load news', {
				description: error.message,
			})
		}
	}, [error])

	// Initialize posts from first query
	useEffect(() => {
		if (snapshot && !loading) {
			const posts = snapshot.docs.map((doc) => ({
				id: doc.id,
				data: doc.data(),
			}))
			setAllPosts(posts)

			// Set last document for pagination
			if (snapshot.docs.length > 0) {
				setLastDoc(snapshot.docs[snapshot.docs.length - 1])
			}

			// Check if there might be more posts
			setHasMore(snapshot.docs.length === NEWS_PAGE_SIZE)
		}
	}, [snapshot, loading])

	// Load more posts
	const loadMore = useCallback(async () => {
		if (
			!selectedSeasonQueryDocumentSnapshot ||
			!lastDoc ||
			!hasMore ||
			isLoadingMore
		) {
			return
		}

		setIsLoadingMore(true)

		try {
			const nextQuery = newsQueryBySeason(
				selectedSeasonQueryDocumentSnapshot.ref,
				NEWS_PAGE_SIZE,
				lastDoc
			)
			const nextSnapshot = await getDocs(nextQuery)

			if (nextSnapshot.docs.length > 0) {
				const newPosts = nextSnapshot.docs.map((doc) => ({
					id: doc.id,
					data: doc.data(),
				}))

				setAllPosts((prev) => [...prev, ...newPosts])
				setLastDoc(nextSnapshot.docs[nextSnapshot.docs.length - 1])
				setHasMore(nextSnapshot.docs.length === NEWS_PAGE_SIZE)
			} else {
				setHasMore(false)
			}
		} catch (err) {
			logger.error('Error loading more news:', err)
		} finally {
			setIsLoadingMore(false)
		}
	}, [selectedSeasonQueryDocumentSnapshot, lastDoc, hasMore, isLoadingMore])

	// Intersection Observer for infinite scroll
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
					loadMore()
				}
			},
			{ threshold: 0.1 }
		)

		const currentTarget = observerTarget.current
		if (currentTarget) {
			observer.observe(currentTarget)
		}

		return () => {
			if (currentTarget) {
				observer.unobserve(currentTarget)
			}
		}
	}, [hasMore, isLoadingMore, loadMore])

	// Reset state when season changes
	useEffect(() => {
		setAllPosts([])
		setLastDoc(undefined)
		setHasMore(true)
		setIsLoadingMore(false)
	}, [selectedSeasonQueryDocumentSnapshot?.id])

	if (error) {
		return (
			<PageContainer>
				<PageHeader
					title='News'
					description='Stay up-to-date with league announcements and updates'
					icon={Newspaper}
				/>
				<div className='text-center text-destructive mt-8'>
					<p>Error loading news posts. Please try again later.</p>
				</div>
			</PageContainer>
		)
	}

	if (loading) {
		return (
			<PageContainer>
				<PageHeader
					title='News'
					description='Stay up-to-date with league announcements and updates'
					icon={Newspaper}
				/>
				<div
					className='flex items-center justify-center min-h-[400px]'
					role='status'
					aria-label='Loading news'
				>
					<LoadingSpinner size='lg' label='Loading news...' />
				</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer>
			<PageHeader
				title='News'
				description='Stay up-to-date with league announcements and updates'
				icon={Newspaper}
			/>

			{allPosts.length === 0 ? (
				<NewsEmptyState />
			) : (
				<div className='space-y-6 mt-8'>
					{allPosts.map((post) => (
						<NewsCard key={post.id} post={post.data} postId={post.id} />
					))}

					{/* Intersection observer target */}
					<div ref={observerTarget} className='h-4' />

					{/* Loading indicator for pagination */}
					{isLoadingMore && (
						<div className='flex justify-center py-8'>
							<LoadingSpinner size='md' label='Loading more posts...' />
						</div>
					)}

					{/* End of posts message */}
					{!hasMore && allPosts.length > 0 && (
						<p className='text-center text-muted-foreground py-8'>
							You've reached the end of the news feed
						</p>
					)}
				</div>
			)}
		</PageContainer>
	)
}
