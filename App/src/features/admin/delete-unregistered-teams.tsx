/**
 * Teams Management admin component
 *
 * Displays all teams for the current season and allows admin to manage them
 */

import React, { useState, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	Trash2,
	AlertTriangle,
	RefreshCw,
	Users as UsersIcon,
	CheckCircle,
	Shield,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { currentSeasonTeamsQuery } from '@/firebase/collections/teams'
import { deleteUnregisteredTeamViaFunction } from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader } from '@/shared/components'
import { Badge } from '@/components/ui/badge'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TeamDocument } from '@/types'
import { useSeasonsContext } from '@/providers'
import { logger } from '@/shared/utils'

export const TeamsManagement: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Fetch all teams for current season
	const [teamsSnapshot, teamsLoading] = useCollection(
		currentSeasonTeamsQuery(currentSeasonQueryDocumentSnapshot)
	)

	// State for delete confirmation dialog
	const [teamToDelete, setTeamToDelete] = useState<{
		id: string
		name: string
		rosterSize: number
	} | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Filter for unregistered teams
	const unregisteredTeams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}))
			.filter((team) => !team.registered)
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [teamsSnapshot])

	// Filter for registered teams
	const registeredTeams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}))
			.filter((team) => team.registered)
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [teamsSnapshot])

	const handleDeleteClick = (team: TeamDocument & { id: string }) => {
		setTeamToDelete({
			id: team.id,
			name: team.name,
			rosterSize: team.roster?.length || 0,
		})
	}

	const handleConfirmDelete = async () => {
		if (!teamToDelete) return

		setIsDeleting(true)
		try {
			const result = await deleteUnregisteredTeamViaFunction({
				teamId: teamToDelete.id,
			})

			toast.success(result.message, {
				description: `${result.playersRemoved} player${result.playersRemoved !== 1 ? 's' : ''} removed from team`,
			})

			// Close dialog
			setTeamToDelete(null)
		} catch (error: unknown) {
			logger.error(
				'Error deleting unregistered team',
				error instanceof Error ? error : undefined,
				{ component: 'TeamsManagement', action: 'deleteTeam' }
			)

			// Extract error message from Firebase Functions error
			let errorMessage = 'Failed to delete team. Please try again.'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = (error as { message: string }).message
			}

			toast.error(errorMessage)
		} finally {
			setIsDeleting(false)
		}
	}

	// Handle authentication and data loading
	if (playerLoading || teamsLoading) {
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
				title='Teams Management'
				description='Manage registered and unregistered teams for the current season'
				icon={Shield}
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

			{/* Registered Teams Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<CheckCircle className='h-5 w-5 text-green-600' />
						Registered Teams ({registeredTeams.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{registeredTeams.length === 0 ? (
						<div className='text-center py-12'>
							<AlertTriangle className='h-12 w-12 text-yellow-500 mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Registered Teams
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								No teams in the current season are registered yet.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Team Name</TableHead>
										<TableHead>Roster Size</TableHead>
										<TableHead>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{registeredTeams.map((team) => (
										<TableRow key={team.id}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<Link
														to={`/teams/${team.id}`}
														className='font-medium hover:underline'
													>
														{team.name}
													</Link>
												</div>
											</TableCell>
											<TableCell>
												<div className='flex items-center gap-2'>
													<UsersIcon className='h-4 w-4 text-muted-foreground' />
													<span>{team.roster?.length || 0} players</span>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant='secondary'
													className='bg-green-100 text-green-800'
												>
													Registered
												</Badge>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Unregistered Teams Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Trash2 className='h-5 w-5 text-red-600' />
						Unregistered Teams ({unregisteredTeams.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{unregisteredTeams.length === 0 ? (
						<div className='text-center py-12'>
							<CheckCircle className='h-12 w-12 text-green-500 mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Unregistered Teams
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								All teams in the current season are registered.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Team Name</TableHead>
										<TableHead>Roster Size</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{unregisteredTeams.map((team) => (
										<TableRow key={team.id}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<Link
														to={`/teams/${team.id}`}
														className='font-medium hover:underline'
													>
														{team.name}
													</Link>
												</div>
											</TableCell>
											<TableCell>
												<div className='flex items-center gap-2'>
													<UsersIcon className='h-4 w-4 text-muted-foreground' />
													<span>{team.roster?.length || 0} players</span>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant='secondary'
													className='bg-red-100 text-red-800'
												>
													Unregistered
												</Badge>
											</TableCell>
											<TableCell className='text-right'>
												<Button
													variant='destructive'
													size='sm'
													onClick={() => handleDeleteClick(team)}
												>
													<Trash2 className='h-4 w-4 mr-2' />
													Delete Team
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

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
							Only unregistered teams from the current season can be deleted.
						</li>
						<li>
							Deleting a team will remove all players from the team roster and
							update their player documents.
						</li>
						<li>
							Players who were captains of the deleted team will lose their
							captain status.
						</li>
						<li>
							All offers (invitations and requests) related to the team will be
							deleted.
						</li>
						<li>This action cannot be undone.</li>
						<li>Registered teams cannot be deleted using this tool.</li>
					</ul>
				</CardContent>
			</Card>

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={!!teamToDelete}
				onOpenChange={(open) => !open && setTeamToDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-red-600' />
							Delete Team "{teamToDelete?.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription className='space-y-2'>
							<p>
								This will permanently delete the team and remove all{' '}
								<strong>{teamToDelete?.rosterSize} player(s)</strong> from the
								roster.
							</p>
							<p className='text-red-600 font-semibold'>
								This action cannot be undone.
							</p>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							disabled={isDeleting}
							className='bg-red-600 hover:bg-red-700'
						>
							{isDeleting ? (
								<>
									<RefreshCw className='h-4 w-4 mr-2 animate-spin' />
									Deleting...
								</>
							) : (
								<>
									<Trash2 className='h-4 w-4 mr-2' />
									Delete Team
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageContainer>
	)
}
