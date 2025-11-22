/**
 * Season Management admin component
 *
 * Allows admin users to create, edit, and delete seasons
 */

import React, { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { getDocs } from 'firebase/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Calendar,
	Plus,
	Edit,
	Trash2,
	Loader2,
	X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { format } from 'date-fns'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { teamsBySeasonQuery } from '@/firebase/collections/teams'
import {
	createSeasonViaFunction,
	updateSeasonViaFunction,
	deleteSeasonViaFunction,
} from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer, PageHeader } from '@/shared/components'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DestructiveConfirmationDialog } from '@/shared/components/destructive-confirmation-dialog'
import { SeasonDocument, TeamDocument } from '@/types'

interface ProcessedSeason {
	id: string
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamIds: string[]
	teamCount: number
}

type DialogMode = 'create' | 'edit' | null

export const SeasonManagement: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Fetch all seasons
	const [seasonsSnapshot, seasonsLoading] = useCollection(seasonsQuery())

	// Dialog state
	const [dialogMode, setDialogMode] = useState<DialogMode>(null)
	const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)

	// Form state
	const [formName, setFormName] = useState('')
	const [formDateStart, setFormDateStart] = useState('')
	const [formDateEnd, setFormDateEnd] = useState('')
	const [formRegistrationStart, setFormRegistrationStart] = useState('')
	const [formRegistrationEnd, setFormRegistrationEnd] = useState('')
	const [formTeamIds, setFormTeamIds] = useState<string[]>([])

	// Team selection state
	const [availableTeams, setAvailableTeams] = useState<
		{ id: string; name: string }[]
	>([])
	const [selectedTeamId, setSelectedTeamId] = useState('')

	// Delete confirmation state
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [seasonToDelete, setSeasonToDelete] = useState<ProcessedSeason | null>(
		null
	)

	// Loading states
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Process seasons
	const [seasons, setSeasons] = useState<ProcessedSeason[]>([])

	useEffect(() => {
		if (!seasonsSnapshot) {
			setSeasons([])
			return
		}

		const processSeasons = async () => {
			const results = await Promise.all(
				seasonsSnapshot.docs.map(async (seasonDoc) => {
					const seasonData = seasonDoc.data() as SeasonDocument
					const seasonId = seasonDoc.id

					try {
						// Get team IDs from the teams array
						const teamIds = seasonData.teams?.map((teamRef) => teamRef.id) || []

						return {
							id: seasonId,
							name: seasonData.name,
							dateStart: seasonData.dateStart.toDate(),
							dateEnd: seasonData.dateEnd.toDate(),
							registrationStart: seasonData.registrationStart.toDate(),
							registrationEnd: seasonData.registrationEnd.toDate(),
							teamIds,
							teamCount: teamIds.length,
						} as ProcessedSeason
					} catch (error) {
						console.error('Error processing season', seasonId, error)
						return null
					}
				})
			)

			const validSeasons = results.filter(
				(r): r is ProcessedSeason => r !== null
			)
			setSeasons(validSeasons)
		}

		processSeasons()
	}, [seasonsSnapshot])

	// Load available teams when editing a season
	useEffect(() => {
		if (dialogMode === 'edit' && selectedSeasonId) {
			const loadTeams = async () => {
				try {
					const seasonDoc = seasonsSnapshot?.docs.find(
						(doc) => doc.id === selectedSeasonId
					)
					if (!seasonDoc) return

					const seasonRef = seasonDoc.ref
					const teamsQuery = teamsBySeasonQuery(seasonRef)

					if (teamsQuery) {
						const teamsSnapshot = await getDocs(teamsQuery)
						const teams = teamsSnapshot.docs.map((doc: any) => ({
							id: doc.id,
							name: (doc.data() as TeamDocument).name,
						}))
						setAvailableTeams(teams)
					}
				} catch (error) {
					console.error('Error loading teams:', error)
				}
			}

			loadTeams()
		}
	}, [dialogMode, selectedSeasonId, seasonsSnapshot])

	const formatDateTime = (date: Date) => {
		return format(date, 'MMM dd, yyyy h:mm a')
	}

	const formatDateForInput = (date: Date) => {
		// Format as "YYYY-MM-DDTHH:mm" for datetime-local input
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, '0')
		const day = String(date.getDate()).padStart(2, '0')
		const hours = String(date.getHours()).padStart(2, '0')
		const minutes = String(date.getMinutes()).padStart(2, '0')
		return `${year}-${month}-${day}T${hours}:${minutes}`
	}

	const openCreateDialog = () => {
		setDialogMode('create')
		setSelectedSeasonId(null)
		setFormName('')
		setFormDateStart('')
		setFormDateEnd('')
		setFormRegistrationStart('')
		setFormRegistrationEnd('')
		setFormTeamIds([])
		setAvailableTeams([])
	}

	const openEditDialog = (season: ProcessedSeason) => {
		setDialogMode('edit')
		setSelectedSeasonId(season.id)
		setFormName(season.name)
		setFormDateStart(formatDateForInput(season.dateStart))
		setFormDateEnd(formatDateForInput(season.dateEnd))
		setFormRegistrationStart(formatDateForInput(season.registrationStart))
		setFormRegistrationEnd(formatDateForInput(season.registrationEnd))
		setFormTeamIds(season.teamIds)
	}

	const closeDialog = () => {
		setDialogMode(null)
		setSelectedSeasonId(null)
		setFormName('')
		setFormDateStart('')
		setFormDateEnd('')
		setFormRegistrationStart('')
		setFormRegistrationEnd('')
		setFormTeamIds([])
		setAvailableTeams([])
		setSelectedTeamId('')
	}

	const handleAddTeam = () => {
		if (selectedTeamId && !formTeamIds.includes(selectedTeamId)) {
			setFormTeamIds([...formTeamIds, selectedTeamId])
			setSelectedTeamId('')
		}
	}

	const handleRemoveTeam = (teamId: string) => {
		setFormTeamIds(formTeamIds.filter((id) => id !== teamId))
	}

	const handleSubmit = async () => {
		// Validation
		if (!formName.trim()) {
			toast.error('Season name is required')
			return
		}

		if (formName.length < 3 || formName.length > 100) {
			toast.error('Season name must be between 3 and 100 characters')
			return
		}

		if (
			!formDateStart ||
			!formDateEnd ||
			!formRegistrationStart ||
			!formRegistrationEnd
		) {
			toast.error('All date fields are required')
			return
		}

		setIsSubmitting(true)

		try {
			const data = {
				name: formName.trim(),
				dateStart: new Date(formDateStart),
				dateEnd: new Date(formDateEnd),
				registrationStart: new Date(formRegistrationStart),
				registrationEnd: new Date(formRegistrationEnd),
				teamIds: formTeamIds,
			}

			if (dialogMode === 'create') {
				const result = await createSeasonViaFunction(data)
				toast.success(result.message)
			} else if (dialogMode === 'edit' && selectedSeasonId) {
				const result = await updateSeasonViaFunction({
					seasonId: selectedSeasonId,
					...data,
				})
				toast.success(result.message)
			}

			closeDialog()
		} catch (error) {
			console.error('Error submitting season:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to save season'
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleDeleteClick = (season: ProcessedSeason) => {
		setSeasonToDelete(season)
		setDeleteDialogOpen(true)
	}

	const handleDeleteConfirm = async () => {
		if (!seasonToDelete) return

		try {
			const result = await deleteSeasonViaFunction({
				seasonId: seasonToDelete.id,
			})
			toast.success(result.message)
			setDeleteDialogOpen(false)
			setSeasonToDelete(null)
		} catch (error) {
			console.error('Error deleting season:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete season'
			)
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
							You don't have permission to access this page.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Season Management'
				description='Create, edit, and manage league seasons'
				icon={Calendar}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
				<Button onClick={openCreateDialog}>
					<Plus className='h-4 w-4 mr-2' />
					Create Season
				</Button>
			</div>

			{/* Seasons Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Calendar className='h-5 w-5 text-purple-600' />
						All Seasons ({seasons.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{seasonsLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading seasons...</p>
						</div>
					) : seasons.length === 0 ? (
						<div className='text-center py-12'>
							<Calendar className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Seasons Found
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Create your first season to get started.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Season Dates</TableHead>
										<TableHead>Registration Dates</TableHead>
										<TableHead>Teams</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{seasons.map((season) => (
										<TableRow key={season.id}>
											<TableCell>
												<div className='font-medium'>{season.name}</div>
											</TableCell>
											<TableCell>
												<div className='text-sm space-y-1'>
													<div>
														<span className='text-muted-foreground'>
															Start:{' '}
														</span>
														{formatDateTime(season.dateStart)}
													</div>
													<div>
														<span className='text-muted-foreground'>End: </span>
														{formatDateTime(season.dateEnd)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<div className='text-sm space-y-1'>
													<div>
														<span className='text-muted-foreground'>
															Start:{' '}
														</span>
														{formatDateTime(season.registrationStart)}
													</div>
													<div>
														<span className='text-muted-foreground'>End: </span>
														{formatDateTime(season.registrationEnd)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge variant='secondary'>
													{season.teamCount} teams
												</Badge>
											</TableCell>
											<TableCell className='text-right'>
												<div className='flex items-center justify-end gap-2'>
													<Button
														size='sm'
														variant='outline'
														onClick={() => openEditDialog(season)}
													>
														<Edit className='h-3 w-3 mr-1' />
														Edit
													</Button>
													<Button
														size='sm'
														variant='destructive'
														onClick={() => handleDeleteClick(season)}
													>
														<Trash2 className='h-3 w-3 mr-1' />
														Delete
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

			{/* Create/Edit Dialog */}
			<Dialog
				open={dialogMode !== null}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>
							{dialogMode === 'create' ? 'Create New Season' : 'Edit Season'}
						</DialogTitle>
						<DialogDescription>
							{dialogMode === 'create'
								? 'Add a new season to the league. This will automatically be added to all existing players.'
								: 'Update season information. Changes will be reflected immediately.'}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						{/* Season Name */}
						<div className='space-y-2'>
							<Label htmlFor='name'>
								Season Name <span className='text-red-500'>*</span>
							</Label>
							<Input
								id='name'
								placeholder='e.g., Winter 2025'
								value={formName}
								onChange={(e) => setFormName(e.target.value)}
								maxLength={100}
							/>
							<p className='text-xs text-muted-foreground'>
								{formName.length}/100 characters
							</p>
						</div>

						{/* Date Fields */}
						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='dateStart'>
									Season Start Date <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='dateStart'
									type='datetime-local'
									value={formDateStart}
									onChange={(e) => setFormDateStart(e.target.value)}
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='dateEnd'>
									Season End Date <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='dateEnd'
									type='datetime-local'
									value={formDateEnd}
									onChange={(e) => setFormDateEnd(e.target.value)}
								/>
							</div>
						</div>

						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='registrationStart'>
									Registration Start <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='registrationStart'
									type='datetime-local'
									value={formRegistrationStart}
									onChange={(e) => setFormRegistrationStart(e.target.value)}
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='registrationEnd'>
									Registration End <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='registrationEnd'
									type='datetime-local'
									value={formRegistrationEnd}
									onChange={(e) => setFormRegistrationEnd(e.target.value)}
								/>
							</div>
						</div>

						{/* Team Selection (Edit Mode Only) */}
						{dialogMode === 'edit' && (
							<div className='space-y-2'>
								<Label>Associated Teams</Label>
								<div className='flex gap-2'>
									<select
										className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
										value={selectedTeamId}
										onChange={(e) => setSelectedTeamId(e.target.value)}
									>
										<option value=''>Select a team to add...</option>
										{availableTeams
											.filter((team) => !formTeamIds.includes(team.id))
											.map((team) => (
												<option key={team.id} value={team.id}>
													{team.name}
												</option>
											))}
									</select>
									<Button
										type='button'
										onClick={handleAddTeam}
										disabled={!selectedTeamId}
									>
										<Plus className='h-4 w-4' />
									</Button>
								</div>
								{formTeamIds.length > 0 && (
									<div className='flex flex-wrap gap-2 mt-2'>
										{formTeamIds.map((teamId) => {
											const team = availableTeams.find((t) => t.id === teamId)
											return (
												<Badge
													key={teamId}
													variant='secondary'
													className='flex items-center gap-1'
												>
													{team?.name || teamId}
													<button
														type='button'
														onClick={() => handleRemoveTeam(teamId)}
														className='ml-1 hover:text-destructive'
													>
														<X className='h-3 w-3' />
													</button>
												</Badge>
											)
										})}
									</div>
								)}
								<p className='text-xs text-muted-foreground'>
									{formTeamIds.length} team(s) selected
								</p>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={closeDialog}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									{dialogMode === 'create' ? 'Creating...' : 'Saving...'}
								</>
							) : (
								<>
									{dialogMode === 'create' ? 'Create Season' : 'Save Changes'}
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				onConfirm={handleDeleteConfirm}
				title='Delete Season'
				description={
					seasonToDelete
						? `Are you absolutely sure you want to delete "${seasonToDelete.name}"? This action cannot be undone and will remove the season from all player records. Associated teams, games, and offers will have orphaned references.`
						: ''
				}
				continueText='Delete Season'
			>
				<div />
			</DestructiveConfirmationDialog>
		</PageContainer>
	)
}
