import { ReloadIcon } from '@radix-ui/react-icons'
import { cn } from '@/shared/utils'

interface LoadingSpinnerProps {
	/**
	 * Size variant of the spinner
	 * - sm: h-3 w-3 (for small buttons/inline)
	 * - md: h-4 w-4 (default, for regular buttons)
	 * - lg: h-10 w-10 (for full page loading)
	 */
	size?: 'sm' | 'md' | 'lg'
	/**
	 * Whether to include margin-right spacing
	 */
	withMargin?: boolean
	/**
	 * Additional CSS classes
	 */
	className?: string
	/**
	 * Text to display alongside spinner (screen reader)
	 */
	label?: string
	/**
	 * Whether to center the spinner (useful for full page loading)
	 */
	centered?: boolean
}

/**
 * Flexible loading spinner component for indicating loading states
 * Replaces duplicate ReloadIcon usage across the codebase
 */
export const LoadingSpinner = ({
	size = 'md',
	withMargin = true,
	className,
	label = 'Loading',
	centered = false,
}: LoadingSpinnerProps) => {
	const sizeClasses = {
		sm: 'h-3 w-3',
		md: 'h-4 w-4',
		lg: 'h-10 w-10',
	}

	const spinner = (
		<ReloadIcon
			className={cn(
				'animate-spin',
				sizeClasses[size],
				withMargin && 'mr-2',
				className
			)}
			aria-label={label}
		/>
	)

	if (centered) {
		return (
			<div className='absolute inset-0 flex items-center justify-center'>
				{spinner}
			</div>
		)
	}

	return spinner
}
