import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton variants for different UI elements
 * Provides consistent loading states for common components
 */

export const CardSkeleton = () => (
	<div className='space-y-3 p-4 border rounded-lg'>
		<Skeleton className='h-4 w-3/4' />
		<Skeleton className='h-4 w-1/2' />
		<Skeleton className='h-20 w-full' />
	</div>
)

export const TableRowSkeleton = () => (
	<div className='flex space-x-4 py-2'>
		<Skeleton className='h-4 w-1/4' />
		<Skeleton className='h-4 w-1/4' />
		<Skeleton className='h-4 w-1/4' />
		<Skeleton className='h-4 w-1/4' />
	</div>
)

export const AvatarSkeleton = () => (
	<Skeleton className='h-10 w-10 rounded-full' />
)

export const ButtonSkeleton = () => <Skeleton className='h-10 w-20' />

export const FormFieldSkeleton = () => (
	<div className='space-y-2'>
		<Skeleton className='h-4 w-20' />
		<Skeleton className='h-10 w-full' />
	</div>
)
