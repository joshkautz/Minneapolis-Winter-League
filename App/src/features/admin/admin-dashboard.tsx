/**
 * Main admin dashboard component
 *
 * Provides navigation to various admin functions and system overview
 */

import React, { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { addNewSeasonToAllPlayersViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Settings,
	Users,
	Trophy,
	BarChart3,
	AlertTriangle,
	Shield,
	Calendar,
	UserPlus,
	FileCheck,
	CheckCircle,
	ClipboardList,
	Mail,
	Trash2,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'
import { SeasonDocument } from '@/types'

export const AdminDashboard: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
	const [isAddingSeasonToPlayers, setIsAddingSeasonToPlayers] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	const handleAddSeasonToAllPlayers = async () => {
		if (!selectedSeasonId) {
			toast.error('Please select a season')
			return
		}

		setIsAddingSeasonToPlayers(true)
		try {
			const result = await addNewSeasonToAllPlayersViaFunction({
				seasonId: selectedSeasonId,
			})

			if (result.success) {
				toast.success(result.message)
				setSelectedSeasonId('')
			} else {
				toast.error(result.message)
			}
		} catch (error) {
			console.error('Error adding season to players:', error)
			toast.error('Failed to add season to players. Please try again.')
		} finally {
			setIsAddingSeasonToPlayers(false)
		}
	}

	// Handle authentication and data loading
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
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Admin Dashboard'
				description='Manage system settings and monitor application status'
				icon={Shield}
			/>

			{/* Admin Functions Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6'>
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
								Manage Player Rankings
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* User Management */}
				<Card className='hover:shadow-lg transition-shadow'>
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
						<Button asChild className='w-full'>
							<Link to='/admin/user-management'>
								<Users className='h-4 w-4 mr-2' />
								Manage Users
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Waiver Status */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<FileCheck className='h-5 w-5 text-orange-600' />
							Waiver Status
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Check which players have paid for registration but haven't signed
							their waiver yet.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/waiver-status'>
								<FileCheck className='h-4 w-4 mr-2' />
								Check Waiver Status
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Email Verification */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<CheckCircle className='h-5 w-5 text-green-600' />
							Email Verification
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Manually mark user email addresses as verified in Firebase
							Authentication.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/email-verification'>
								<CheckCircle className='h-4 w-4 mr-2' />
								Verify Email
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Player Registration Status */}
				{/* Player Registration Status */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<ClipboardList className='h-5 w-5 text-indigo-600' />
							Registration Status
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View all players and their email verification, payment, and waiver
							status.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/player-registration-status'>
								<ClipboardList className='h-4 w-4 mr-2' />
								View Registration Status
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Pending Offers */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Mail className='h-5 w-5 text-orange-600' />
							Pending Offers
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View all outstanding team invitations and join requests that are
							awaiting response.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/pending-offers'>
								<Mail className='h-4 w-4 mr-2' />
								View Pending Offers
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Season Management */} {/* Season Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Calendar className='h-5 w-5 text-purple-600' />
							Season Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Add new seasons to all player profiles. This creates PlayerSeason
							entries for every player with default values.
						</p>
						<div className='space-y-3'>
							<Select
								value={selectedSeasonId}
								onValueChange={setSelectedSeasonId}
								disabled={!seasons || seasons.length === 0}
							>
								<SelectTrigger className='w-full'>
									<SelectValue placeholder='Select a season to add' />
								</SelectTrigger>
								<SelectContent>
									{seasons?.map((season) => (
										<SelectItem key={season.id} value={season.id}>
											{season.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								onClick={handleAddSeasonToAllPlayers}
								disabled={!selectedSeasonId || isAddingSeasonToPlayers}
								className='w-full'
							>
								<UserPlus className='h-4 w-4 mr-2' />
								{isAddingSeasonToPlayers
									? 'Adding Season...'
									: 'Add Season to All Players'}
							</Button>
						</div>
					</CardContent>
				</Card>
				{/* Delete Unregistered Teams */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-red-600' />
							Delete Unregistered Teams
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Remove unregistered teams from the current season and properly
							update all affected players.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/delete-unregistered-teams'>
								<Trash2 className='h-4 w-4 mr-2' />
								Manage Unregistered Teams
							</Link>
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
		</PageContainer>
	)
}
