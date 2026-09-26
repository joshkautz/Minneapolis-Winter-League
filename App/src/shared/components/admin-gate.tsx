import type { PropsWithChildren } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthContext } from '@/providers'
import { LoadingSpinner } from './loading-spinner'

/**
 * Renders the admin pages only for an admin. The player document's `admin`
 * flag decides, read from the auth context rather than by each page: every
 * admin screen used to open its own listener on the player document and
 * carry its own copy of this check.
 *
 * This hides the pages; it does not protect anything. Every admin callable
 * checks for itself, so a non-admin who got past this could still do
 * nothing.
 */
export const AdminGate = ({ children }: PropsWithChildren) => {
	const { authenticatedUserSnapshot, authenticatedUserSnapshotLoading } =
		useAuthContext()

	if (authenticatedUserSnapshotLoading) {
		return (
			<div
				className='flex items-center justify-center min-h-[50vh]'
				role='status'
				aria-label='Checking your access'
			>
				<LoadingSpinner size='lg' />
			</div>
		)
	}

	if (authenticatedUserSnapshot?.data()?.admin !== true) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' aria-hidden='true' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							This page is for league administrators.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return children
}
