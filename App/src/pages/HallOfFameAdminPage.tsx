/**
 * Hall of Fame Admin page - dedicated admin interface
 */

import React from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { HallOfFameAdmin } from '@/features/hallOfFame/HallOfFameAdmin'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export const HallOfFameAdminPage: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, loading] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	if (loading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<p>Loading...</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (!isAdmin) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							You don't have permission to access the Hall of Fame admin
							interface.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className='container mx-auto px-4 py-8'>
			<HallOfFameAdmin />
		</div>
	)
}
