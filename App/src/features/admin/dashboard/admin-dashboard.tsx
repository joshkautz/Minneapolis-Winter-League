/**
 * Main admin dashboard component
 *
 * Provides navigation to various admin functions and system overview
 */

import { useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { logger } from '@/shared/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Settings,
	Trophy,
	AlertTriangle,
	Shield,
	Calendar,
	Mail,
	Trash2,
	UserCog,
	Newspaper,
	Users,
	Award,
	Palette,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'

export const AdminDashboard = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Log and notify on query errors
	useEffect(() => {
		if (playerError) {
			logger.error('Failed to load player:', {
				component: 'AdminDashboard',
				error: playerError.message,
			})
			toast.error('Failed to load player', {
				description: playerError.message,
			})
		}
	}, [playerError])

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
				{/* Rankings Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trophy className='h-5 w-5 text-yellow-600' />
							Rankings Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Manage player ranking calculations and monitor the ELO rating
							system status.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/rankings-management'>
								<Settings className='h-4 w-4 mr-2' />
								Manage Rankings
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
							<Link to='/admin/offer-management'>
								<Mail className='h-4 w-4 mr-2' />
								Manage Offers
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Season Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Calendar className='h-5 w-5 text-purple-600' />
							Season Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Create, edit, and delete league seasons. Automatically manages
							season data across all player profiles.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/season-management'>
								<Calendar className='h-4 w-4 mr-2' />
								Manage Seasons
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Team Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-blue-600' />
							Team Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View all teams for the current season and manage unregistered
							teams.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/team-management'>
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
				{/* Registration Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Users className='h-5 w-5 text-teal-600' />
							Registration Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							View players registered without teams and players on teams without
							registration.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/registration-management'>
								<Users className='h-4 w-4 mr-2' />
								Manage Registration
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Badge Management */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Award className='h-5 w-5 text-amber-600' />
							Badge Management
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Create and manage badges that can be awarded to teams for special
							accomplishments.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/badge-management'>
								<Award className='h-4 w-4 mr-2' />
								Manage Badges
							</Link>
						</Button>
					</CardContent>
				</Card>
				{/* Site Settings */}
				<Card className='hover:shadow-lg transition-shadow'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Palette className='h-5 w-5 text-pink-600' />
							Site Settings
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Configure site-wide settings including seasonal theme variants
							like Valentine's Day.
						</p>
						<Button asChild className='w-full'>
							<Link to='/admin/site-settings'>
								<Palette className='h-4 w-4 mr-2' />
								Site Settings
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</PageContainer>
	)
}
