import { Suspense, ReactNode } from 'react'

/**
 * LazyWrapper Component
 *
 * Provides a consistent loading UI for lazy-loaded components.
 * Eliminates repetitive Suspense boilerplate throughout the application.
 *
 * Used in App.tsx routing to wrap all lazy-loaded route components.
 */

interface LazyWrapperProps {
	children: ReactNode
	fallback?: ReactNode
}

export function LazyWrapper({
	children,
	fallback = <LoadingSpinner />,
}: LazyWrapperProps) {
	return <Suspense fallback={fallback}>{children}</Suspense>
}

// Consistent loading UI across the application
function LoadingSpinner() {
	return (
		<div className='min-h-[50vh] flex items-center justify-center'>
			<div className='flex flex-col items-center gap-3'>
				<div className='w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin' />
				<p className='text-sm text-muted-foreground'>Loading...</p>
			</div>
		</div>
	)
}
