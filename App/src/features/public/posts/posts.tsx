import { useState, useEffect, useCallback, useRef } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { getDocs, type DocumentSnapshot } from 'firebase/firestore'
import { Users } from 'lucide-react'
import { useSeasonsContext, useAuthContext } from '@/providers'
import { postsQueryBySeason } from '@/firebase/collections/posts'
import { PostDocument } from '@/types'
import { PageContainer, PageHeader, LoadingSpinner } from '@/shared/components'
import { logger } from '@/shared/utils'
import { PostCard } from './post-card'
import { PostsEmptyState } from './posts-empty-state'
import { CreatePostDialog } from './create-post-dialog'

const PAGE_SIZE = 10

/**
 * Message Board page component
 * Displays posts with infinite scroll
 */
export const Posts = () => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { authStateUser } = useAuthContext()
	const [allPosts, setAllPosts] = useState<
		Array<{ id: string; data: PostDocument }>
	>([])
	const [lastDoc, setLastDoc] = useState<
		DocumentSnapshot<PostDocument> | undefined
	>(undefined)
	const [hasMore, setHasMore] = useState(true)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const observerTarget = useRef<HTMLDivElement>(null)

	// Initial query for first page
	const initialQuery = selectedSeasonQueryDocumentSnapshot
		? postsQueryBySeason(selectedSeasonQueryDocumentSnapshot.ref, PAGE_SIZE)
		: null

	const [snapshot, loading, error] = useCollection(initialQuery)

	// Log and notify on query errors
	useEffect(() => {
		if (error) {
			logger.error('Failed to load posts:', {
				component: 'Posts',
				error: error.message,
			})
			toast.error('Failed to load posts', {
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
			setHasMore(snapshot.docs.length === PAGE_SIZE)
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
			const nextQuery = postsQueryBySeason(
				selectedSeasonQueryDocumentSnapshot.ref,
				PAGE_SIZE,
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
				setHasMore(nextSnapshot.docs.length === PAGE_SIZE)
			} else {
				setHasMore(false)
			}
		} catch (err) {
			logger.error('Error loading more posts:', err)
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

	// Check if user can post (authenticated with verified email)
	const canPost = authStateUser?.emailVerified === true

	if (error) {
		return (
			<PageContainer>
				<PageHeader
					title='Message Board'
					description='Community posts for the season'
					icon={Users}
					showSeasonIndicator
				/>
				<div className='text-center text-destructive mt-8'>
					<p>Error loading posts. Please try again later.</p>
				</div>
			</PageContainer>
		)
	}

	if (loading) {
		return (
			<PageContainer>
				<PageHeader
					title='Message Board'
					description='Community posts for the season'
					icon={Users}
					showSeasonIndicator
				/>
				<div
					className='flex items-center justify-center min-h-[400px]'
					role='status'
					aria-label='Loading posts'
				>
					<LoadingSpinner size='lg' label='Loading posts...' />
				</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer>
			<PageHeader
				title='Message Board'
				description='Community posts for the season'
				icon={Users}
				showSeasonIndicator
			/>

			{/* Create post button for authenticated users */}
			{selectedSeasonQueryDocumentSnapshot && (
				<div className='mt-6'>
					<CreatePostDialog
						seasonId={selectedSeasonQueryDocumentSnapshot.id}
						canPost={canPost}
					/>
				</div>
			)}

			{allPosts.length === 0 ? (
				<PostsEmptyState />
			) : (
				<div className='space-y-6 mt-8'>
					{allPosts.map((post) => (
						<PostCard
							key={post.id}
							post={post.data}
							postId={post.id}
							currentUserId={authStateUser?.uid}
						/>
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
							You've reached the end of the posts
						</p>
					)}
				</div>
			)}
		</PageContainer>
	)
}
