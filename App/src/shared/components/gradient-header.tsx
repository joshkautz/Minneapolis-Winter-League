import { ReactNode } from 'react'
import { cn } from '@/shared/utils'

export const GradientHeader = ({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) => {
	return (
		<div
			className={cn(
				'max-w-max mx-auto my-8 text-2xl font-extrabold text-transparent bg-clip-text',
				// Light mode gradient - vibrant blue to cyan with purple accent
				'bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-500',
				// Dark mode gradient - brighter colors with better contrast
				'dark:from-blue-400 dark:via-purple-400 dark:to-cyan-300',
				// Animated gradient background
				'gradient-animated',
				// Accessibility: ensure proper contrast and reduce motion for users who prefer it
				'motion-reduce:animate-none motion-reduce:bg-gradient-to-r',
				className
			)}
		>
			{children}
		</div>
	)
}
