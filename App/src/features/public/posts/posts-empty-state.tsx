/**
 * Empty state component for when there are no posts
 */
export const PostsEmptyState = () => {
	return (
		<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
			<div className='space-y-3'>
				<p className='text-muted-foreground font-medium text-lg'>
					No posts yet
				</p>
				<p className='text-muted-foreground/70 text-sm max-w-md'>
					No posts have been created for this season yet. Be the first to share
					something with the community.
				</p>
			</div>
		</div>
	)
}
