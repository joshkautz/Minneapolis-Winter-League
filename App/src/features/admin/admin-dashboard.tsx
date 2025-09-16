/**
 * Main admin dashboard component
 *
 * Provides navigation to various admin functions and system overview
 */

import React from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Settings,
	Users,
	Trophy,
	BarChart3,
	AlertTriangle,
	Shield,
} from 'lucide-react'

export const AdminDashboard: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Handle authentication loading
	if (playerLoading) {
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

	// Handle non-admin users
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
							You don't have permission to access the admin dashboard.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Shield className='h-8 w-8' />
					Admin Dashboard
				</h1>
				<p className='text-muted-foreground'>
					Manage system settings and monitor application status
				</p>
			</div>

			{/* Admin Functions Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
				{/* Player Rankings Administration */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trophy className='h-5 w-5 text-yellow-600' />
							Player Rankings
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Manage player rankings calculations and monitor player rankings
							system status.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/player-rankings'>
								<Settings className='h-4 w-4 mr-2' />
								Manage Rankings
							</Link>
						</Button>
					</CardContent>
				</Card>

				{/* User Management (placeholder for future) */}
				<Card className='hover:shadow-lg transition-shadow opacity-50'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Users className='h-5 w-5 text-blue-600' />
							User Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Manage user accounts, permissions, and player profiles.
						</p>
						<Button disabled className='w-full'>
							<Users className='h-4 w-4 mr-2' />
							Coming Soon
						</Button>
					</CardContent>
				</Card>

				{/* System Analytics (placeholder for future) */}
				<Card className='hover:shadow-lg transition-shadow opacity-50'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<BarChart3 className='h-5 w-5 text-green-600' />
							Analytics
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View system analytics, usage statistics, and performance metrics.
						</p>
						<Button disabled className='w-full'>
							<BarChart3 className='h-4 w-4 mr-2' />
							Coming Soon
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Quick Actions */}
			<Card>
				<CardHeader>
					<CardTitle>Quick Actions</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert>
						<Settings className='h-4 w-4' />
						<AlertDescription>
							You have administrator privileges. Use these tools responsibly to
							maintain system integrity and user experience.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		</div>
	)
}
