'use client'

import * as React from 'react'
import { cn } from '@/shared/utils'

interface SeparatorWithTextProps {
	children: React.ReactNode
	className?: string
}

function SeparatorWithText({ children, className }: SeparatorWithTextProps) {
	return (
		<div className={cn('relative flex items-center py-3', className)}>
			<div className='flex-grow border-t border-border' />
			<span className='flex-shrink mx-4 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider'>
				{children}
			</span>
			<div className='flex-grow border-t border-border' />
		</div>
	)
}

export { SeparatorWithText }
