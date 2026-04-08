'use client'

import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '@/shared/utils'

/**
 * ⚠️ Known footgun: do NOT use `<ScrollArea>` inside a flex-column
 * `<DialogContent>` with `flex-1 min-h-0`. Radix's ScrollArea Root uses
 * `position: relative` with an absolute-positioned Viewport that needs
 * its container to have an explicitly bounded height. Inside a flex
 * column dialog, `flex-1 min-h-0` doesn't reliably bound the Root's
 * height — the Viewport sizes to its content instead of its container,
 * and the inner scrollbar never engages, leaving content unreachable.
 *
 * For dialogs use a plain `<div className='flex-1 min-h-0 overflow-y-auto'>`
 * instead. See team-edit-dialog.tsx and merge-teams-dialog.tsx for the
 * correct pattern, and commit `c9d18531` for the original fix.
 *
 * ScrollArea is fine in non-flex layouts where the Root has an
 * explicit/intrinsic height (sidebars, dropdown menus, fixed-height
 * cards).
 */
function ScrollArea({
	className,
	children,
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot='scroll-area'
			className={cn('relative', className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot='scroll-area-viewport'
				className='focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1'
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	)
}

function ScrollBar({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
	return (
		<ScrollAreaPrimitive.ScrollAreaScrollbar
			data-slot='scroll-area-scrollbar'
			orientation={orientation}
			className={cn(
				'flex touch-none p-px transition-colors select-none',
				orientation === 'vertical' &&
					'h-full w-2.5 border-l border-l-transparent',
				orientation === 'horizontal' &&
					'h-2.5 flex-col border-t border-t-transparent',
				className
			)}
			{...props}
		>
			<ScrollAreaPrimitive.ScrollAreaThumb
				data-slot='scroll-area-thumb'
				className='bg-border relative flex-1 rounded-full'
			/>
		</ScrollAreaPrimitive.ScrollAreaScrollbar>
	)
}

export { ScrollArea, ScrollBar }
