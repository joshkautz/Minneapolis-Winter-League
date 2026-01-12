import { ComingSoon } from '@/shared/components'

/**
 * Empty state component for when there are no posts
 */
export const PostsEmptyState = () => {
	return (
		<ComingSoon>
			<p>
				No one is looking for a team yet this season. Be the first to post and
				find your next team!
			</p>
		</ComingSoon>
	)
}
