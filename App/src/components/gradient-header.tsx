import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
				'max-w-max mx-auto my-8 text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-primary to-sky-300',
				className
			)}
		>
			{children}
		</div>
	)
}
