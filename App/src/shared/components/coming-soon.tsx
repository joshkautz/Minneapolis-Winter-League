import { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/shared/utils'
import { SparklesCore } from '@/features/public/home/particles'
import { useSiteSettings } from '@/providers'

export const ComingSoon = ({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) => {
	const { isValentine } = useSiteSettings()

	// Theme-based particle configuration
	const particleConfig = isValentine
		? { variant: 'hearts' as const, minSize: 2, maxSize: 4, density: 40 }
		: { variant: 'snow' as const, minSize: 0.4, maxSize: 1.2, density: 60 }

	return (
		<Card className={cn('w-full py-0 gap-0 overflow-hidden', className)}>
			<CardHeader
				className={cn(
					'relative flex items-center justify-center h-40 text-2xl font-bold md:h-60 overflow-hidden px-0',
					'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white'
				)}
			>
				<div className='absolute inset-0 w-full h-full pointer-events-none opacity-60 dark:opacity-40'>
					<SparklesCore
						background='transparent'
						minSize={particleConfig.minSize}
						maxSize={particleConfig.maxSize}
						particleDensity={particleConfig.density}
						className='w-full h-full'
						speed={2}
						variant={particleConfig.variant}
					/>
				</div>
				<span className='relative z-10'>Coming Soon</span>
			</CardHeader>
			<CardContent className='py-6 text-center text-base text-muted-foreground [&>p]:text-base'>
				{children}
			</CardContent>
		</Card>
	)
}
