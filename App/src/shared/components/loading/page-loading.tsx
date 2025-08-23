import { Skeleton } from '@/components/ui/skeleton'
import { GradientHeader } from '../gradient-header'

/**
 * Standardized page loading component
 * Used for full page loading states
 */
export const PageLoading = () => {
	return (
		<div className="space-y-6">
			<GradientHeader>Loading...</GradientHeader>
			<div className="space-y-4">
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-4 w-2/3" />
				<div className="space-y-2">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
			</div>
		</div>
	)
}
