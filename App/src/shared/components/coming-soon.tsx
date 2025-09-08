import { ReactNode, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/shared/utils'
import { SparklesCore } from '@/features/home/particles'

export const ComingSoon = ({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) => {
	const sparklesCore = useMemo(() => {
		return (
			<SparklesCore
				background='transparent'
				minSize={0.4}
				maxSize={1.2}
				particleDensity={60}
				className='w-full h-full'
				particleColor='#FFFFFF'
				speed={2}
			/>
		)
	}, [])

	return (
		<Card className={cn('max-w-[800px] w-full mx-auto py-0', className)}>
			<CardHeader className={cn(
				'relative flex items-center justify-center h-40 text-2xl font-bold rounded-t-lg text-white md:h-60 overflow-hidden',
				// Light mode gradient - vibrant blue to cyan with purple accent
				'bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-500',
				// Dark mode gradient - brighter colors with better contrast
				'dark:from-blue-400 dark:via-purple-400 dark:to-cyan-300',
				// Animated gradient background
				'gradient-animated',
				// Accessibility: ensure proper contrast and reduce motion for users who prefer it
				'motion-reduce:animate-none motion-reduce:bg-gradient-to-r'
			)}>
				<div className='absolute inset-0 w-full h-full pointer-events-none'>
					{sparklesCore}
				</div>
				<span className='relative z-10'>Coming Soon</span>
			</CardHeader>
			<CardContent className='pb-6 text-center'>{children}</CardContent>
		</Card>
	)
}
