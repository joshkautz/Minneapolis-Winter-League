/**
 * Waiver Status admin component
 *
 * Displays players who have paid for registration but haven't signed their waiver
 */

import React, { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	FileCheck,
	AlertTriangle,
	RefreshCw,
	FileText,
	Mail,
	User,
	Users as UsersIcon,
	CheckCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { getPlayersWithPendingWaiversViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageContainer, PageHeader } from '@/shared/components'

interface PlayerWithPendingWaiver {
	uid: string
	firstname: string
	lastname: string
	email: string
	teamName: string | null
	teamId: string | null
}

interface WaiverStatusData {
	seasonId: string
	seasonName: string
	players: PlayerWithPendingWaiver[]
	count: number
}

export const WaiverStatus: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const [waiverData, setWaiverData] = useState<WaiverStatusData | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	const isAdmin = playerSnapshot?.data()?.admin || false

	const handleCheckWaiverStatus = async () => {
		setIsLoading(true)
		try {
			const result = await getPlayersWithPendingWaiversViaFunction()

			if (result.success) {
				setWaiverData({
					seasonId: result.seasonId,
					seasonName: result.seasonName,
					players: result.players,
					count: result.count,
				})
				toast.success(result.message)
			}
		} catch (error: unknown) {
			console.error('Error checking waiver status:', error)

			// Extract error message from Firebase Functions error
			let errorMessage = 'Failed to check waiver status. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}

			toast.error(errorMessage)
		} finally {
			setIsLoading(false)
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
				title='Waiver Status'
				description='Check which players have paid but not signed their waiver'
				icon={FileCheck}
			/>

			{/* Back to Dashboard */}
			<div>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Check Status Card */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<FileText className='h-5 w-5 text-orange-600' />
						Check Pending Waivers
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							This will check all players who have paid for registration in the
							current season but have not yet signed their waiver.
						</p>
						<Button
							onClick={handleCheckWaiverStatus}
							disabled={isLoading}
							className='w-full'
						>
							{isLoading ? (
								<>
									<RefreshCw className='h-4 w-4 mr-2 animate-spin' />
									Checking Waiver Status...
								</>
							) : (
								<>
									<FileCheck className='h-4 w-4 mr-2' />
									Check Waiver Status
								</>
							)}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Results Card */}
			{waiverData && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center justify-between'>
							<span className='flex items-center gap-2'>
								<UsersIcon className='h-5 w-5 text-blue-600' />
								Players with Pending Waivers
							</span>
							<Badge variant='secondary' className='ml-auto'>
								{waiverData.count} player{waiverData.count !== 1 ? 's' : ''}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-4'>
							<div className='flex items-center justify-between pb-2'>
								<div className='text-sm text-muted-foreground'>
									<strong>Season:</strong> {waiverData.seasonName}
								</div>
								<Badge variant='outline'>{waiverData.seasonId}</Badge>
							</div>

							{waiverData.count === 0 ? (
								<div className='text-center py-12'>
									<CheckCircle className='h-12 w-12 text-green-500 mx-auto mb-4' />
									<p className='text-lg font-medium text-muted-foreground'>
										All Clear!
									</p>
									<p className='text-sm text-muted-foreground mt-2'>
										All players who have paid for registration have signed their
										waivers.
									</p>
								</div>
							) : (
								<div className='overflow-x-auto'>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Name</TableHead>
												<TableHead>Email</TableHead>
												<TableHead>Team</TableHead>
												<TableHead>User ID</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{waiverData.players.map((player) => (
												<TableRow key={player.uid}>
													<TableCell>
														<div className='flex items-center gap-2'>
															<User className='h-4 w-4 text-muted-foreground' />
															<span className='font-medium'>
																{player.firstname} {player.lastname}
															</span>
														</div>
													</TableCell>
													<TableCell>
														<div className='flex items-center gap-2'>
															<Mail className='h-4 w-4 text-muted-foreground' />
															<a
																href={`mailto:${player.email}`}
																className='text-blue-600 hover:underline'
															>
																{player.email}
															</a>
														</div>
													</TableCell>
													<TableCell>
														{player.teamName && player.teamId ? (
															<Link
																to={`/teams/${player.teamId}`}
																className='text-blue-600 hover:underline'
															>
																{player.teamName}
															</Link>
														) : (
															<span className='text-muted-foreground italic'>
																Not rostered
															</span>
														)}
													</TableCell>
													<TableCell>
														<code className='text-xs bg-muted px-2 py-1 rounded'>
															{player.uid}
														</code>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Important Notes */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<AlertTriangle className='h-5 w-5 text-yellow-600' />
						Important Notes
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className='text-sm space-y-2 list-disc list-inside text-muted-foreground'>
						<li>
							This check only includes players who have completed payment for
							the current season.
						</li>
						<li>
							Players who have not paid are not included in this list, even if
							they haven't signed a waiver.
						</li>
						<li>
							The waiver signature request is automatically sent when a player
							completes payment.
						</li>
						<li>
							You can use the email addresses to follow up with players who need
							to complete their waiver.
						</li>
						<li>
							Players can also request a reminder email from their profile page.
						</li>
					</ul>
				</CardContent>
			</Card>
		</PageContainer>
	)
}
