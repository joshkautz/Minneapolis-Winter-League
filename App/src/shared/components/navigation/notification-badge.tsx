import { Badge } from '@/components/ui/badge'
import { cn } from '@/shared/utils'

interface NotificationBadgeProps {
	count: number
	className?: string
	variant?: 'default' | 'secondary' | 'destructive' | 'outline'
	/**
	 * Position variant for absolute positioning
	 * - 'button-overlay': Positioned in top-right corner of a button (for button overlays)
	 * - 'inline': Inline with content (for menu items)
	 */
	position?: 'button-overlay' | 'inline'
}

/**
 * Notification badge component that displays a count number
 * with different positioning variants for buttons and menu items
 */
export const NotificationBadge = ({
	count,
	className,
	variant = 'default',
	position = 'inline',
}: NotificationBadgeProps) => {
	// Don't render if count is 0 or negative
	if (!count || count <= 0) return null

	const baseClasses = 'text-xs leading-none min-w-[1rem] h-4 px-1'

	const positionClasses = {
		'button-overlay': 'absolute -top-1 -right-1 z-10',
		inline: 'ml-2 inline-flex',
	}

	return (
		<Badge
			variant={variant}
			className={cn(baseClasses, positionClasses[position], className)}
		>
			{count > 99 ? '99+' : count.toString()}
		</Badge>
	)
}
