import { Skeleton } from '@/components/ui/skeleton'

interface ComponentLoadingProps {
	rows?: number
	className?: string
}

/**
 * Standardized component loading state
 * Used for individual component loading states
 */
export const ComponentLoading = ({
	rows = 3,
	className,
}: ComponentLoadingProps) => {
	return (
		<div className={className}>
			<div className='space-y-2'>
				{Array.from({ length: rows }, (_, i) => (
					<Skeleton key={i} className='h-4 w-full' />
				))}
			</div>
		</div>
	)
}
