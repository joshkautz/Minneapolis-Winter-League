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
			<CardHeader className='relative flex items-center justify-center h-40 text-2xl font-bold rounded-t-lg text-background md:h-60 bg-linear-to-r from-primary to-sky-300 overflow-hidden'>
				<div className='absolute inset-0 w-full h-full pointer-events-none'>
					{sparklesCore}
				</div>
				<span className='relative z-10'>Coming Soon</span>
			</CardHeader>
			<CardContent className='pb-6 text-center'>{children}</CardContent>
		</Card>
	)
}
