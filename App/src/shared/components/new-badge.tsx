import { cn } from '@/shared/utils'

interface NewBadgeProps {
	className?: string
}

/**
 * A small "NEW" badge component for highlighting new features
 */
export const NewBadge = ({ className }: NewBadgeProps) => {
	return (
		<span
			className={cn(
				'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
				className
			)}
		>
			NEW
		</span>
	)
}
