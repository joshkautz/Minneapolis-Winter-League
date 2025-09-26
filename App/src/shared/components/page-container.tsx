import { PropsWithChildren } from 'react'
import { cn } from '@/shared/utils'

interface PageContainerProps extends PropsWithChildren {
	/**
	 * Additional CSS classes for the container
	 */
	className?: string
	/**
	 * Whether to include the standard spacing (py-8)
	 */
	withSpacing?: boolean
	/**
	 * Whether to include the standard gap spacing between children (space-y-6)
	 */
	withGap?: boolean
}

/**
 * Standard page container component that provides consistent layout
 * Replaces repeated 'container mx-auto px-4 py-8' patterns across pages
 */
export const PageContainer = ({
	children,
	className,
	withSpacing = true,
	withGap = true,
}: PageContainerProps) => {
	return (
		<div
			className={cn(
				'container mx-auto px-4',
				withSpacing && 'py-8',
				withGap && 'space-y-6',
				className
			)}
		>
			{children}
		</div>
	)
}
