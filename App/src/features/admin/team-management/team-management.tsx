/**
 * Team Management admin component
 *
 * Displays all teams for the current season and allows admin to manage them
 */

import { useState, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import {
	ArrowLeft,
	Trash2,
	AlertTriangle,
	RefreshCw,
	CheckCircle,
	Shield,
	Award,
	Pencil,
	Combine,
	Wallet,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { usesTeamPayments } from '@/shared/utils'
import { getPlayerRef } from '@/firebase/collections/players'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	canonicalTeamRefFromTeamSeasonDoc,
	teamsInSeasonQuery,
} from '@/firebase/collections/teams'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer, PageHeader, QueryError } from '@/shared/components'
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
import { TeamDocument, SeasonDocument, TeamSeasonDocument } from '@/types'
import { useSeasonsContext } from '@/providers'
import { useQueryErrorHandler } from '@/shared/hooks'
import { TeamBadgesDialog } from './components/team-badges-dialog'
import { TeamEditDialog } from './components/team-edit-dialog'
import { MergeTeamsDialog } from './components/merge-teams-dialog'
import { TeamPaymentsDialog } from './components/team-payments-dialog'
import { DeleteTeamDialog } from './components/delete-team-dialog'
import { RosterSize } from './components/roster-size'
import { DocumentReference } from '@/firebase'

export const TeamManagement = () => {
	const navigate = useNavigate()
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotError: seasonsError,
		currentSeasonQueryDocumentSnapshot,
	} = useSeasonsContext()

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Season selection state
	// Derived rather than stored: the selection defaults to the current season
	// until the user picks one. An effect that seeded state once the season
	// loaded rendered an empty selection first and then corrected it, which
	// React 19 flags as a cascading render.
	const [selectedSeasonOverride, setSelectedSeasonId] = useState<
		string | undefined
	>(undefined)
	const selectedSeasonId =
		selectedSeasonOverride ?? currentSeasonQueryDocumentSnapshot?.id ?? ''
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Get selected season snapshot
	const selectedSeasonSnapshot = selectedSeasonId
		? seasonsSnapshot?.docs.find((doc) => doc.id === selectedSeasonId)
		: null

	// Fetch team season subdocs for selected season
	const [teamsSnapshot, teamsLoading, teamsError] = useCollection(
		selectedSeasonSnapshot
			? teamsInSeasonQuery(selectedSeasonSnapshot.ref)
			: null
	)

	// Log and notify on query errors
	useQueryErrorHandler({
		error: playerError,
		component: 'TeamManagement',
		errorLabel: 'player',
	})
	useQueryErrorHandler({
		error: seasonsError,
		component: 'TeamManagement',
		errorLabel: 'seasons',
	})
	useQueryErrorHandler({
		error: teamsError,
		component: 'TeamManagement',
		errorLabel: 'teams',
	})

	// State for delete confirmation dialog
	const [teamToDelete, setTeamToDelete] = useState<{
		id: string
		name: string
	} | null>(null)
	// Only the current season's teams can be deleted; deleteUnregisteredTeam
	// refuses any other.
	const isCurrentSeasonSelected =
		!!selectedSeasonId &&
		selectedSeasonId === currentSeasonQueryDocumentSnapshot?.id

	// State for badge management dialog
	const [teamForBadges, setTeamForBadges] = useState<{
		id: string
		name: string
		ref: DocumentReference<TeamDocument>
	} | null>(null)

	// State for edit dialog
	const [teamToEdit, setTeamToEdit] = useState<{
		id: string
		name: string
		seasonId: string
	} | null>(null)

	// State for the team payments dialog. Only offered for a season on team
	// payments; the ledger it shows is readable by admins and the team.
	const [teamForPayments, setTeamForPayments] = useState<{
		id: string
		name: string
	} | null>(null)
	const selectedSeasonUsesTeamPayments = usesTeamPayments(
		selectedSeasonSnapshot?.data()
	)

	// State for merge dialog (keyed by the winning team)
	const [teamToMergeInto, setTeamToMergeInto] = useState<{
		id: string
		name: string
	} | null>(null)

	// Filter for unregistered teams
	const unregisteredTeams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => {
				const data = doc.data() as TeamSeasonDocument
				return {
					id: canonicalTeamIdFromTeamSeasonDoc(doc),
					ref: canonicalTeamRefFromTeamSeasonDoc(doc),
					name: data.name,
					registered: data.registered,
					data,
				}
			})
			.filter((team) => !team.registered)
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [teamsSnapshot])

	// Filter for registered teams
	const registeredTeams = useMemo(() => {
		if (!teamsSnapshot) return []

		return teamsSnapshot.docs
			.map((doc) => {
				const data = doc.data() as TeamSeasonDocument
				return {
					id: canonicalTeamIdFromTeamSeasonDoc(doc),
					ref: canonicalTeamRefFromTeamSeasonDoc(doc),
					name: data.name,
					registered: data.registered,
					data,
				}
			})
			.filter((team) => team.registered)
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [teamsSnapshot])

	type TeamRow = {
		id: string
		ref: DocumentReference<TeamDocument>
		name: string
		registered: boolean
		data: TeamSeasonDocument
	}

	const handleDeleteClick = (team: TeamRow) => {
		setTeamToDelete({ id: team.id, name: team.name })
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

	const handleMergeClick = (team: TeamRow) => {
		setTeamToMergeInto({ id: team.id, name: team.name })
	}

	const handleEditClick = (team: TeamRow) => {
		setTeamToEdit({
			id: team.id,
			name: team.name,
			seasonId: selectedSeasonId,
		})
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

	// Handle query errors
	if (seasonsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={seasonsError}
					title='Error Loading Seasons'
					onRetry={() => navigate(0)}
				/>
			</div>
		)
	}

	if (teamsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={teamsError}
					title='Error Loading Teams'
					onRetry={() => navigate(0)}
				/>
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
							Only unregistered teams in the current season can be deleted.
							Deleting one removes its players from the roster, revokes captain
							status, and deletes its open offers.
						</li>
						<li>
							A registered team cannot be deleted. To refund one, release its
							money from Payments; to combine two, use Merge.
						</li>
					</ul>
				</AlertDescription>
			</Alert>

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
														to={`/teams/${team.id}/${selectedSeasonId}`}
														className='font-medium hover:underline'
													>
														{team.name}
													</Link>
												</div>
											</TableCell>
											<TableCell>
												<RosterSize
													teamId={team.id}
													seasonId={selectedSeasonId}
												/>
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
														onClick={() => handleEditClick(team)}
													>
														<Pencil className='h-4 w-4 mr-2' />
														Edit
													</Button>
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
													{selectedSeasonUsesTeamPayments && (
														<Button
															variant='outline'
															size='sm'
															onClick={() =>
																setTeamForPayments({
																	id: team.id,
																	name: team.name,
																})
															}
														>
															<Wallet className='h-4 w-4 mr-2' />
															Payments
														</Button>
													)}
													<Button
														variant='outline'
														size='sm'
														onClick={() => handleMergeClick(team)}
													>
														<Combine className='h-4 w-4 mr-2' />
														Merge...
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
														to={`/teams/${team.id}/${selectedSeasonId}`}
														className='font-medium hover:underline'
													>
														{team.name}
													</Link>
												</div>
											</TableCell>
											<TableCell>
												<RosterSize
													teamId={team.id}
													seasonId={selectedSeasonId}
												/>
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
														onClick={() => handleEditClick(team)}
													>
														<Pencil className='h-4 w-4 mr-2' />
														Edit
													</Button>
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
													{selectedSeasonUsesTeamPayments && (
														<Button
															variant='outline'
															size='sm'
															onClick={() =>
																setTeamForPayments({
																	id: team.id,
																	name: team.name,
																})
															}
														>
															<Wallet className='h-4 w-4 mr-2' />
															Payments
														</Button>
													)}
													<Button
														variant='outline'
														size='sm'
														onClick={() => handleMergeClick(team)}
													>
														<Combine className='h-4 w-4 mr-2' />
														Merge...
													</Button>
													{isCurrentSeasonSelected && (
														<Button
															variant='destructive'
															size='sm'
															onClick={() => handleDeleteClick(team)}
														>
															<Trash2 className='h-4 w-4 mr-2' />
															Delete Team
														</Button>
													)}
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

			<DeleteTeamDialog
				team={teamToDelete}
				seasonId={selectedSeasonId}
				onClose={() => setTeamToDelete(null)}
			/>

			{/* Badge Management Dialog */}
			{teamForBadges && (
				<TeamBadgesDialog
					open={!!teamForBadges}
					onOpenChange={(open) => !open && setTeamForBadges(null)}
					teamId={teamForBadges.id}
					teamName={teamForBadges.name}
					teamRef={teamForBadges.ref}
					seasonId={selectedSeasonId}
				/>
			)}

			{/* Team Payments Dialog */}
			{teamForPayments && selectedSeasonId && (
				<TeamPaymentsDialog
					open={!!teamForPayments}
					onOpenChange={(open) => !open && setTeamForPayments(null)}
					teamId={teamForPayments.id}
					teamName={teamForPayments.name}
					seasonId={selectedSeasonId}
				/>
			)}

			{/* Team Edit Dialog */}
			{teamToEdit && (
				<TeamEditDialog
					open={!!teamToEdit}
					onOpenChange={(open) => !open && setTeamToEdit(null)}
					teamDocId={teamToEdit.id}
					teamName={teamToEdit.name}
					seasonId={teamToEdit.seasonId}
				/>
			)}

			{/* Merge Teams Dialog */}
			{teamToMergeInto && (
				<MergeTeamsDialog
					open={!!teamToMergeInto}
					onOpenChange={(open) => !open && setTeamToMergeInto(null)}
					winningTeamId={teamToMergeInto.id}
					winningTeamName={teamToMergeInto.name}
				/>
			)}
		</PageContainer>
	)
}
