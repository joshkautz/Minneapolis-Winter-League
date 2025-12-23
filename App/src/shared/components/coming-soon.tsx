import { ReactNode, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/shared/utils'
import { SparklesCore } from '@/features/public/home/particles'

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
		<Card className={cn('w-full', className)}>
			<CardHeader
				className={cn(
					'relative flex items-center justify-center h-40 text-2xl font-bold rounded-t-lg md:h-60 overflow-hidden',
					'bg-primary/10 text-primary dark:bg-primary/20'
				)}
			>
				<div className='absolute inset-0 w-full h-full pointer-events-none opacity-60 dark:opacity-40'>
					{sparklesCore}
				</div>
				<span className='relative z-10'>Coming Soon</span>
			</CardHeader>
			<CardContent className='pb-6 text-center text-base text-muted-foreground [&>p]:text-base'>
				{children}
			</CardContent>
		</Card>
	)
}
