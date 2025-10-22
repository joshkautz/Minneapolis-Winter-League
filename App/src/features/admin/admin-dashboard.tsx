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
	Trophy,
	AlertTriangle,
	Shield,
	Calendar,
	UserPlus,
	FileCheck,
	CheckCircle,
	Mail,
	Trash2,
	UserCog,
	Newspaper,
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

			<Alert>
				<Settings className='h-4 w-4' />
				<AlertDescription>
					You have administrator privileges. Use these tools responsibly to
					maintain system integrity and user experience.
				</AlertDescription>
			</Alert>

			{/* Admin Functions Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6'>
				{/* Player Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<UserCog className='h-5 w-5 text-purple-600' />
							Player Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Search, view, and edit player documents including season data and
							team assignments.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/player-management'>
								<UserCog className='h-4 w-4 mr-2' />
								Manage Players
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Game Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Calendar className='h-5 w-5 text-indigo-600' />
							Game Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Create, view, and manage game schedules for the current season.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/game-management'>
								<Calendar className='h-4 w-4 mr-2' />
								Manage Games
							</Link>
						</Button>
					</CardContent>
				</Card>
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
				{/* Offer Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Mail className='h-5 w-5 text-orange-600' />
							Offer Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View and manage all team invitations and join requests. Accept,
							reject, or cancel pending offers.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/manage-offers'>
								<Mail className='h-4 w-4 mr-2' />
								Manage Offers
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
				{/* Teams Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-blue-600' />
							Teams Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View all teams for the current season and manage unregistered
							teams.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/teams-management'>
								<Trash2 className='h-4 w-4 mr-2' />
								Manage Teams
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* News Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Newspaper className='h-5 w-5 text-cyan-600' />
							News Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Create, edit, and manage news posts to keep participants
							up-to-date with league announcements.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/news-management'>
								<Newspaper className='h-4 w-4 mr-2' />
								Manage News
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</PageContainer>
	)
}
