import { Newspaper } from 'lucide-react'
import { useSeasonsContext } from '@/providers'
import { newsQueryBySeason } from '@/firebase/collections/news'
import type { NewsDocument } from '@/types'
import { PageContainer, PageHeader, LoadingSpinner } from '@/shared/components'
import { NewsCard } from './news-card'
import { NewsEmptyState } from './news-empty-state'
import { usePaginatedFeed } from '@/shared/hooks'

const NEWS_PAGE_SIZE = 10

/**
 * News page component
 * Displays published news posts for the current season with infinite scroll
 */
export const News = () => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const seasonRef = selectedSeasonQueryDocumentSnapshot?.ref
	const {
		items: allPosts,
		loading,
		error,
		hasMore,
		isLoadingMore,
		sentinelRef,
	} = usePaginatedFeed<NewsDocument>({
		pageQuery: seasonRef
			? (after) => newsQueryBySeason(seasonRef, NEWS_PAGE_SIZE, after)
			: null,
		pageSize: NEWS_PAGE_SIZE,
		component: 'News',
		errorLabel: 'news',
	})

	if (error) {
		return (
			<PageContainer>
				<PageHeader
					title='News'
					description='Stay up-to-date with league announcements and updates'
					icon={Newspaper}
					showSeasonIndicator
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
					showSeasonIndicator
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
				showSeasonIndicator
			/>

			{allPosts.length === 0 ? (
				<NewsEmptyState />
			) : (
				<div className='space-y-6 mt-8'>
					{allPosts.map((post) => (
						<NewsCard key={post.id} post={post.data} postId={post.id} />
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
							You've reached the end of the news feed
						</p>
					)}
				</div>
			)}
		</PageContainer>
	)
}
