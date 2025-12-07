/**
 * Team Management admin component
 *
 * Displays all teams for the current season and allows admin to manage them
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { QueryDocumentSnapshot } from 'firebase/firestore'
import { toast } from 'sonner'
import {
	ArrowLeft,
	Trash2,
	AlertTriangle,
	RefreshCw,
	Users as UsersIcon,
	CheckCircle,
	Shield,
	Award,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { logger } from '@/shared/utils'
import { getPlayerRef } from '@/firebase/collections/players'
import { currentSeasonTeamsQuery } from '@/firebase/collections/teams'
import {
	deleteUnregisteredTeamViaFunction,
	deleteTeamViaFunction,
} from '@/firebase/collections/functions'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer, PageHeader } from '@/shared/components'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
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
import { TeamDocument, SeasonDocument } from '@/types'
import { useSeasonsContext } from '@/providers'
import { TeamBadgesDialog } from './components/team-badges-dialog'
import { DocumentReference } from '@/firebase/firestore'

export const TeamManagement = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Season selection state
	const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')

	// Fetch all seasons
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Set default selected season to current season
	useEffect(() => {
		if (currentSeasonQueryDocumentSnapshot && !selectedSeasonId) {
			setSelectedSeasonId(currentSeasonQueryDocumentSnapshot.id)
		}
	}, [currentSeasonQueryDocumentSnapshot, selectedSeasonId])

	// Get selected season snapshot
	const selectedSeasonSnapshot = selectedSeasonId
		? seasonsSnapshot?.docs.find((doc) => doc.id === selectedSeasonId)
		: null

	// Fetch teams for selected season
	const [teamsSnapshot, teamsLoading] = useCollection(
		selectedSeasonSnapshot
			? currentSeasonTeamsQuery(
					selectedSeasonSnapshot as QueryDocumentSnapshot<SeasonDocument>
				)
			: null
	)

	// State for delete confirmation dialog
	const [teamToDelete, setTeamToDelete] = useState<{
		id: string
		name: string
		rosterSize: number
		isRegistered: boolean
	} | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// State for badge management dialog
	const [teamForBadges, setTeamForBadges] = useState<{
		id: string
		name: string
		ref: DocumentReference<TeamDocument>
	} | null>(null)

	// Filter for unregistered teams
	const unregisteredTeams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => ({
				id: doc.id,
				ref: doc.ref,
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
				ref: doc.ref,
				...doc.data(),
			}))
			.filter((team) => team.registered)
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [teamsSnapshot])

	const handleDeleteClick = (
		team: TeamDocument & { id: string },
		isRegistered: boolean
	) => {
		setTeamToDelete({
			id: team.id,
			name: team.name,
			rosterSize: team.roster?.length || 0,
			isRegistered,
		})
	}

	const handleManageBadgesClick = (
		teamId: string,
		teamName: string,
		teamRef: DocumentReference<TeamDocument>
	) => {
		setTeamForBadges({
			id: teamId,
			name: teamName,
			ref: teamRef,
		})
	}

	const handleConfirmDelete = async () => {
		if (!teamToDelete) return

		setIsDeleting(true)
		try {
			if (teamToDelete.isRegistered) {
				// For registered teams, use the generic delete function
				await deleteTeamViaFunction(teamToDelete.id)
				toast.success('Team deleted successfully', {
					description: `${teamToDelete.name} has been permanently deleted`,
				})
			} else {
				// For unregistered teams, use the specialized function with detailed response
				const result = await deleteUnregisteredTeamViaFunction({
					teamId: teamToDelete.id,
				})
				toast.success(result.message, {
					description: `${result.playersRemoved} player${result.playersRemoved !== 1 ? 's' : ''} removed from team`,
				})
			}

			// Close dialog
			setTeamToDelete(null)
		} catch (error: unknown) {
			logger.error('Error deleting team:', error)

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
	// Only show full loading screen on initial page load (when player data is loading)
	// For season changes, keep the page structure and show loading state in tables
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
				title='Team Management'
				description='View and manage registered and unregistered teams by season'
				icon={Shield}
			/>

			{/* Back to Dashboard and Season Selector */}
			<div className='flex items-center justify-between gap-4'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>

				<div>
					<Select
						value={selectedSeasonId}
						onValueChange={setSelectedSeasonId}
						disabled={!seasons || seasons.length === 0}
					>
						<SelectTrigger>
							<SelectValue placeholder='Select season' />
						</SelectTrigger>
						<SelectContent>
							{seasons?.map((season) => (
								<SelectItem key={season.id} value={season.id}>
									{season.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Important Notes Alert */}
			<Alert>
				<AlertTriangle className='h-4 w-4' />
				<AlertDescription>
					<ul className='space-y-2 list-disc list-inside'>
						<li>
							Deleting a team will remove all players from the roster, revoke
							captain status, and delete all related offers.
						</li>
					</ul>
				</AlertDescription>
			</Alert>

			{/* Unregistered Teams Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Trash2 className='h-5 w-5 text-red-600' />
						Unregistered Teams ({unregisteredTeams.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{teamsLoading ? (
						<div className='text-center pb-12'>
							<RefreshCw className='h-12 w-12 text-muted-foreground mx-auto mb-2 animate-spin' />
							<p className='text-lg font-medium text-muted-foreground'>
								Loading Teams...
							</p>
						</div>
					) : unregisteredTeams.length === 0 ? (
						<div className='text-center pb-12'>
							<CheckCircle className='h-12 w-12 text-muted-foreground mx-auto mb-2' />
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
												<div className='flex items-center justify-end gap-2'>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															handleManageBadgesClick(
																team.id,
																team.name,
																team.ref
															)
														}
													>
														<Award className='h-4 w-4 mr-2' />
														Badges
													</Button>
													<Button
														variant='destructive'
														size='sm'
														onClick={() => handleDeleteClick(team, false)}
													>
														<Trash2 className='h-4 w-4 mr-2' />
														Delete Team
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Registered Teams Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<CheckCircle className='h-5 w-5 text-green-600' />
						Registered Teams ({registeredTeams.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{teamsLoading ? (
						<div className='text-center pb-12'>
							<RefreshCw className='h-12 w-12 text-muted-foreground mx-auto mb-2 animate-spin' />
							<p className='text-lg font-medium text-muted-foreground'>
								Loading Teams...
							</p>
						</div>
					) : registeredTeams.length === 0 ? (
						<div className='text-center pb-12'>
							<AlertTriangle className='h-12 w-12 text-muted-foreground mx-auto mb-2' />
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
										<TableHead className='text-right'>Actions</TableHead>
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
											<TableCell className='text-right'>
												<div className='flex items-center justify-end gap-2'>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															handleManageBadgesClick(
																team.id,
																team.name,
																team.ref
															)
														}
													>
														<Award className='h-4 w-4 mr-2' />
														Badges
													</Button>
													<Button
														variant='destructive'
														size='sm'
														onClick={() => handleDeleteClick(team, true)}
													>
														<Trash2 className='h-4 w-4 mr-2' />
														Delete Team
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
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

			{/* Badge Management Dialog */}
			{teamForBadges && (
				<TeamBadgesDialog
					open={!!teamForBadges}
					onOpenChange={(open) => !open && setTeamForBadges(null)}
					teamId={teamForBadges.id}
					teamName={teamForBadges.name}
					teamRef={teamForBadges.ref}
				/>
			)}
		</PageContainer>
	)
}
