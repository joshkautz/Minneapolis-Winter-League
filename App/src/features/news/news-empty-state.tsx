import { ComingSoon } from '@/shared/components'

/**
 * Empty state component for when there are no news posts
 */
export const NewsEmptyState = () => {
	return (
		<ComingSoon>
			<p className='text-lg'>
				No news posts yet for this season. Check back soon for updates and
				announcements!
			</p>
		</ComingSoon>
	)
}
