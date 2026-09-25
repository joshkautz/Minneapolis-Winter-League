import { Users } from 'lucide-react'
import { useSeasonsContext, useAuthContext } from '@/providers'
import { postsQueryBySeason } from '@/firebase/collections/posts'
import type { PostDocument } from '@/types'
import { PageContainer, PageHeader, LoadingSpinner } from '@/shared/components'
import { PostCard } from './post-card'
import { PostsEmptyState } from './posts-empty-state'
import { CreatePostDialog } from './create-post-dialog'
import { usePaginatedFeed } from '@/shared/hooks'

const PAGE_SIZE = 10

/**
 * Message Board page component
 * Displays posts with infinite scroll
 */
export const Posts = () => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { authStateUser } = useAuthContext()
	const seasonRef = selectedSeasonQueryDocumentSnapshot?.ref
	const {
		items: allPosts,
		loading,
		error,
		hasMore,
		isLoadingMore,
		sentinelRef,
	} = usePaginatedFeed<PostDocument>({
		pageQuery: seasonRef
			? (after) => postsQueryBySeason(seasonRef, PAGE_SIZE, after)
			: null,
		pageSize: PAGE_SIZE,
		component: 'Posts',
		errorLabel: 'posts',
	})

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

			{/* Create post button for authenticated users (only when posts exist) */}
			{selectedSeasonQueryDocumentSnapshot && allPosts.length > 0 && (
				<div className='mt-6'>
					<CreatePostDialog
						seasonId={selectedSeasonQueryDocumentSnapshot.id}
						canPost={canPost}
					/>
				</div>
			)}

			{allPosts.length === 0 ? (
				<PostsEmptyState
					seasonId={selectedSeasonQueryDocumentSnapshot?.id ?? ''}
					canPost={canPost}
				/>
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
					<div ref={sentinelRef} className='h-4' />

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
