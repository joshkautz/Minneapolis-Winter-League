/**
 * Game Management admin component
 *
 * Allows administrators to create, edit, and delete games
 */

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
	ArrowLeft,
	Edit,
	Trash2,
	Calendar,
	AlertTriangle,
	Plus,
	Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { allGamesQuery } from '@/firebase/collections/games'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { teamsBySeasonQuery, allTeamsQuery } from '@/firebase/collections/teams'
import { useSeasonsContext } from '@/providers'
import {
	createGameViaFunction,
	updateGameViaFunction,
	deleteGameViaFunction,
} from '@/firebase/collections/functions'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { PageContainer, PageHeader } from '@/shared/components'
import { logger } from '@/shared/utils'
import { GameDocument, SeasonDocument, TeamDocument } from '@/types'
import { Timestamp } from '@firebase/firestore'

interface GameFormData {
	date: string
	time: string
	homeTeamId: string
	awayTeamId: string
	field: string
	homeScore: string
	awayScore: string
	type: string
	seasonId: string
}

const INITIAL_FORM_DATA: GameFormData = {
	date: '',
	time: '',
	homeTeamId: '',
	awayTeamId: '',
	field: '1',
	homeScore: '',
	awayScore: '',
	type: '',
	seasonId: '',
}

export function GameManagement() {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const [gamesSnapshot, gamesLoading] = useCollection(allGamesQuery())
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [formData, setFormData] = useState<GameFormData>(INITIAL_FORM_DATA)
	const [editingGameId, setEditingGameId] = useState<string | null>(null)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [gameToDelete, setGameToDelete] = useState<
		(GameDocument & { id: string }) | null
	>(null)
	const [filterSeasonId, setFilterSeasonId] = useState<string>(
		() => currentSeasonQueryDocumentSnapshot?.id || ''
	)
	const [formDialogOpen, setFormDialogOpen] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(() => {
		// Update filter when current season changes and filter hasn't been manually set
		if (currentSeasonQueryDocumentSnapshot?.id && !filterSeasonId) {
			const timer = setTimeout(
				() => setFilterSeasonId(currentSeasonQueryDocumentSnapshot.id),
				0
			)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [currentSeasonQueryDocumentSnapshot?.id, filterSeasonId])

	const isAdmin = playerSnapshot?.data()?.admin || false
	const games = gamesSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (GameDocument & { id: string })[] | undefined
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined
	const isLoading = playerLoading || gamesLoading

	// Get the selected season's document reference for querying teams
	const selectedSeasonDoc = seasons?.find(
		(season) => season.id === formData.seasonId
	)
	const selectedSeasonRef = selectedSeasonDoc
		? seasonsSnapshot?.docs.find((doc) => doc.id === formData.seasonId)
		: undefined

	// Query teams for the selected season (for form dropdowns)
	const [teamsSnapshot] = useCollection(
		teamsBySeasonQuery(selectedSeasonRef?.ref)
	)

	// Query all teams (for displaying team names in the table)
	const [allTeamsSnapshot] = useCollection(allTeamsQuery())

	const teams = teamsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (TeamDocument & { id: string })[] | undefined

	const allTeams = allTeamsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (TeamDocument & { id: string })[] | undefined

	// Sort teams alphabetically by name
	const sortedTeams = teams
		? [...teams].sort((a, b) => a.name.localeCompare(b.name))
		: []

	// Set current season as default when it loads (only set initial value)
	const initialSeasonId = currentSeasonQueryDocumentSnapshot?.id
	const [hasSetInitialFormSeason, setHasSetInitialFormSeason] = useState(false)

	useEffect(() => {
		if (initialSeasonId && !formData.seasonId && !hasSetInitialFormSeason) {
			const timer = setTimeout(() => {
				setFormData((prev) => ({
					...prev,
					seasonId: initialSeasonId,
				}))
				setHasSetInitialFormSeason(true)
			}, 0)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [initialSeasonId, formData.seasonId, hasSetInitialFormSeason])

	const handleInputChange = (field: keyof GameFormData, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	// Generate Saturdays based on the selected season's date range
	const getSaturdays = () => {
		const saturdays: { date: string; display: string }[] = []

		// Get the selected season
		const selectedSeason = seasons?.find(
			(season) => season.id === formData.seasonId
		)

		if (!selectedSeason) {
			return saturdays
		}

		// Get start and end dates from the season
		const startDate = selectedSeason.dateStart.toDate()
		const endDate = selectedSeason.dateEnd.toDate()

		// Start from the first day of the start date
		const currentDate = new Date(startDate)
		currentDate.setHours(0, 0, 0, 0)

		// Find all Saturdays between start and end dates
		while (currentDate <= endDate) {
			if (currentDate.getDay() === 6) {
				// 6 = Saturday
				const dateStr = format(currentDate, 'yyyy-MM-dd')
				const displayStr = format(currentDate, 'MMMM d, yyyy')
				saturdays.push({ date: dateStr, display: displayStr })
			}
			// Move to next day
			currentDate.setDate(currentDate.getDate() + 1)
		}

		return saturdays
	}

	const saturdays = getSaturdays()
	const timeOptions = [
		{ value: '18:00', display: '6:00 PM' },
		{ value: '18:45', display: '6:45 PM' },
		{ value: '19:30', display: '7:30 PM' },
		{ value: '20:15', display: '8:15 PM' },
	]

	const openCreateDialog = () => {
		setFormDialogOpen(true)
		setEditingGameId(null)
		// Pre-select the currently filtered season, or fall back to current season
		const preSelectedSeasonId =
			filterSeasonId || currentSeasonQueryDocumentSnapshot?.id || ''
		setFormData({
			...INITIAL_FORM_DATA,
			seasonId: preSelectedSeasonId,
		})
	}

	const closeDialog = () => {
		setFormDialogOpen(false)
		setEditingGameId(null)
		setFormData(INITIAL_FORM_DATA)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		setIsSubmitting(true)

		try {
			// Validate required fields
			if (!formData.seasonId) {
				toast.error('Missing Required Field', {
					description: 'Please select a season.',
				})
				return
			}

			if (!formData.date) {
				toast.error('Missing Required Field', {
					description: 'Please select a date.',
				})
				return
			}

			if (!formData.time) {
				toast.error('Missing Required Field', {
					description: 'Please select a time.',
				})
				return
			}

			if (!formData.field) {
				toast.error('Missing Required Field', {
					description: 'Please select a field.',
				})
				return
			}

			if (!formData.type) {
				toast.error('Missing Required Field', {
					description: 'Please select a game type.',
				})
				return
			}

			// Parse scores - empty string becomes null
			const homeScore =
				formData.homeScore.trim() === ''
					? null
					: parseInt(formData.homeScore, 10)
			const awayScore =
				formData.awayScore.trim() === ''
					? null
					: parseInt(formData.awayScore, 10)

			// Validate scores
			if (homeScore !== null && (isNaN(homeScore) || homeScore < 0)) {
				toast.error('Invalid Score', {
					description:
						'Home team score must be a non-negative number or empty.',
				})
				return
			}

			if (awayScore !== null && (isNaN(awayScore) || awayScore < 0)) {
				toast.error('Invalid Score', {
					description:
						'Away team score must be a non-negative number or empty.',
				})
				return
			}

			// Validate teams are not the same (but allow both to be empty)
			if (
				formData.homeTeamId &&
				formData.awayTeamId &&
				formData.homeTeamId === formData.awayTeamId
			) {
				toast.error('Invalid Teams', {
					description: 'Home and away teams must be different.',
				})
				return
			}

			// Validate game type
			if (formData.type !== 'regular' && formData.type !== 'playoff') {
				toast.error('Invalid Game Type', {
					description: 'Game type must be either "Regular" or "Playoff".',
				})
				return
			}

			// Parse field number
			const fieldNumber = parseInt(formData.field, 10)
			if (isNaN(fieldNumber)) {
				toast.error('Invalid Field', {
					description: 'Field must be a valid number.',
				})
				return
			}

			// Create ISO timestamp with timezone offset
			const dateObj = new Date(`${formData.date}T${formData.time}`)
			const timezoneOffset = -dateObj.getTimezoneOffset()
			const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60)
			const offsetMinutes = Math.abs(timezoneOffset) % 60
			const offsetSign = timezoneOffset >= 0 ? '+' : '-'
			const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`
			const timestamp = `${formData.date}T${formData.time}:00.000${offsetString}`

			if (editingGameId) {
				// Update existing game
				await updateGameViaFunction({
					gameId: editingGameId,
					timestamp,
					homeTeamId: formData.homeTeamId || null,
					awayTeamId: formData.awayTeamId || null,
					field: fieldNumber,
					homeScore,
					awayScore,
					type: formData.type as 'regular' | 'playoff',
					seasonId: formData.seasonId,
				})

				toast.success('Success', {
					description: 'Game updated successfully',
				})
			} else {
				// Create new game
				await createGameViaFunction({
					timestamp,
					homeTeamId: formData.homeTeamId || null,
					awayTeamId: formData.awayTeamId || null,
					field: fieldNumber,
					homeScore,
					awayScore,
					type: formData.type as 'regular' | 'playoff',
					seasonId: formData.seasonId,
				})

				toast.success('Success', {
					description: 'Game created successfully',
				})
			}

			// Close dialog and reset form
			closeDialog()
		} catch (error) {
			logger.error(
				'Error saving game',
				error instanceof Error ? error : undefined,
				{ component: 'GameManagement', action: 'saveGame' }
			)
			toast.error('Error', {
				description:
					error instanceof Error ? error.message : 'Failed to save game',
			})
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleEditGame = (game: GameDocument & { id: string }) => {
		const gameDate = game.date.toDate()
		const dateStr = format(gameDate, 'yyyy-MM-dd')
		const timeStr = format(gameDate, 'HH:mm')

		setFormData({
			date: dateStr,
			time: timeStr,
			homeTeamId: game.home?.id || '',
			awayTeamId: game.away?.id || '',
			field: game.field.toString(),
			homeScore: game.homeScore !== null ? game.homeScore.toString() : '',
			awayScore: game.awayScore !== null ? game.awayScore.toString() : '',
			type: game.type,
			seasonId: game.season.id,
		})
		setEditingGameId(game.id)
		setFormDialogOpen(true)
	}

	const handleDeleteClick = (game: GameDocument & { id: string }) => {
		setGameToDelete(game)
		setDeleteDialogOpen(true)
	}

	const handleConfirmDelete = async () => {
		if (!gameToDelete) return

		try {
			await deleteGameViaFunction({ gameId: gameToDelete.id })

			toast.success('Success', {
				description: 'Game deleted successfully',
			})

			setDeleteDialogOpen(false)
			setGameToDelete(null)
		} catch (error) {
			logger.error(
				'Error deleting game',
				error instanceof Error ? error : undefined,
				{ component: 'GameManagement', action: 'deleteGame' }
			)
			toast.error('Error', {
				description:
					error instanceof Error ? error.message : 'Failed to delete game',
			})
		}
	}

	const handleCancelDelete = () => {
		setDeleteDialogOpen(false)
		setGameToDelete(null)
	}

	const formatDate = (timestamp: Timestamp) => {
		const date = timestamp.toDate()
		return format(date, 'MMM dd, yyyy')
	}

	const formatTime = (timestamp: Timestamp) => {
		const date = timestamp.toDate()
		return format(date, 'h:mm a')
	}

	const filteredGames = games
		? games.filter(
				(game) => !filterSeasonId || game.season.id === filterSeasonId
			)
		: []

	const sortedGames = filteredGames.length
		? [...filteredGames].sort((a, b) => {
				const dateCompare = a.date.toMillis() - b.date.toMillis()
				if (dateCompare !== 0) return dateCompare
				return a.field - b.field
			})
		: []

	if (playerLoading) {
		return (
			<PageContainer>
				<div className='flex justify-center items-center h-64'>
					<p>Loading...</p>
				</div>
			</PageContainer>
		)
	}

	if (!isAdmin) {
		return (
			<PageContainer>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground text-center'>
							You don't have permission to access game management.
						</p>
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	if (isLoading) {
		return (
			<PageContainer>
				<div className='flex justify-center items-center h-64'>
					<p>Loading games...</p>
				</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Game Management'
				description='Create, edit, and manage game schedules for all seasons'
				icon={Calendar}
			/>

			{/* Back to Dashboard and Create Button */}
			<div className='flex items-center justify-between'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
				<Button onClick={openCreateDialog}>
					<Plus className='h-4 w-4 mr-2' />
					Create Game
				</Button>
			</div>

			{/* Games Table */}
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<CardTitle className='flex items-center gap-2'>
								<Calendar className='h-5 w-5 text-indigo-600' />
								Games ({sortedGames.length})
							</CardTitle>
							<CardDescription>
								View and manage all games in the system
							</CardDescription>
						</div>
						<Select
							value={filterSeasonId}
							onValueChange={(value) => setFilterSeasonId(value)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Filter by season' />
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
				</CardHeader>
				<CardContent>
					{gamesLoading ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading games...</p>
						</div>
					) : sortedGames.length === 0 ? (
						<div className='text-center py-12'>
							<Calendar className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Games Found
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Create your first game to get started.
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Date</TableHead>
										<TableHead>Time</TableHead>
										<TableHead>Field</TableHead>
										<TableHead>Home Team</TableHead>
										<TableHead>Away Team</TableHead>
										<TableHead>Score</TableHead>
										<TableHead>Type</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedGames.map((game) => (
										<TableRow key={game.id}>
											<TableCell>{formatDate(game.date)}</TableCell>
											<TableCell>{formatTime(game.date)}</TableCell>
											<TableCell>Field {game.field}</TableCell>
											<TableCell>
												{game.home?.id
													? allTeams?.find((t) => t.id === game.home?.id)
															?.name || game.home.id
													: 'TBD'}
											</TableCell>
											<TableCell>
												{game.away?.id
													? allTeams?.find((t) => t.id === game.away?.id)
															?.name || game.away.id
													: 'TBD'}
											</TableCell>
											<TableCell>
												{game.homeScore !== null && game.awayScore !== null ? (
													`${game.homeScore} - ${game.awayScore}`
												) : (
													<span className='text-muted-foreground'>
														Not played yet
													</span>
												)}
											</TableCell>
											<TableCell className='capitalize'>{game.type}</TableCell>
											<TableCell className='text-right'>
												<div className='flex items-center justify-end gap-2'>
													<Button
														size='sm'
														variant='outline'
														onClick={() => handleEditGame(game)}
													>
														<Edit className='h-3 w-3 mr-1' />
														Edit
													</Button>
													<Button
														size='sm'
														variant='destructive'
														onClick={() => handleDeleteClick(game)}
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

			{/* Create/Edit Game Dialog */}
			<Dialog
				open={formDialogOpen}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>
							{editingGameId ? 'Edit Game' : 'Create New Game'}
						</DialogTitle>
						<DialogDescription>
							{editingGameId
								? 'Update the game details below'
								: 'Enter the game details below. Leave scores empty to create a game before it is played.'}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						<form onSubmit={handleSubmit} className='space-y-4' id='game-form'>
							<div className='space-y-2'>
								<Label htmlFor='season'>Season</Label>
								<Select
									value={formData.seasonId}
									onValueChange={(value) =>
										handleInputChange('seasonId', value)
									}
								>
									<SelectTrigger id='season' className='w-full'>
										<SelectValue placeholder='Select a season' />
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

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='date'>Date</Label>
									<Select
										value={formData.date}
										onValueChange={(value) => handleInputChange('date', value)}
									>
										<SelectTrigger id='date' className='w-full'>
											<SelectValue placeholder='Select a date' />
										</SelectTrigger>
										<SelectContent>
											{saturdays.map((saturday) => (
												<SelectItem key={saturday.date} value={saturday.date}>
													{saturday.display}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='time'>Time</Label>
									<Select
										value={formData.time}
										onValueChange={(value) => handleInputChange('time', value)}
									>
										<SelectTrigger id='time' className='w-full'>
											<SelectValue placeholder='Select a time' />
										</SelectTrigger>
										<SelectContent>
											{timeOptions.map((time) => (
												<SelectItem key={time.value} value={time.value}>
													{time.display}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='field'>Field</Label>
									<Select
										value={formData.field}
										onValueChange={(value) => handleInputChange('field', value)}
									>
										<SelectTrigger id='field' className='w-full'>
											<SelectValue placeholder='Select a field' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='1'>Field 1</SelectItem>
											<SelectItem value='2'>Field 2</SelectItem>
											<SelectItem value='3'>Field 3</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='type'>Game Type</Label>
									<Select
										value={formData.type}
										onValueChange={(value) => handleInputChange('type', value)}
									>
										<SelectTrigger id='type' className='w-full'>
											<SelectValue placeholder='Select a game type' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='regular'>Regular</SelectItem>
											<SelectItem value='playoff'>Playoff</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='homeTeam'>Home Team</Label>
									<Select
										value={formData.homeTeamId || 'TBD'}
										onValueChange={(value) =>
											handleInputChange(
												'homeTeamId',
												value === 'TBD' ? '' : value
											)
										}
									>
										<SelectTrigger id='homeTeam' className='w-full'>
											<SelectValue placeholder='Select home team' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='TBD' />
											{sortedTeams.map((team) => (
												<SelectItem key={team.id} value={team.id}>
													{team.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='awayTeam'>Away Team</Label>
									<Select
										value={formData.awayTeamId || 'TBD'}
										onValueChange={(value) =>
											handleInputChange(
												'awayTeamId',
												value === 'TBD' ? '' : value
											)
										}
									>
										<SelectTrigger id='awayTeam' className='w-full'>
											<SelectValue placeholder='Select away team' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='TBD' />
											{sortedTeams.map((team) => (
												<SelectItem key={team.id} value={team.id}>
													{team.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='homeScore'>Home Team Score (optional)</Label>
									<Input
										id='homeScore'
										type='number'
										min='0'
										placeholder='Leave empty if not yet played'
										value={formData.homeScore}
										onChange={(e) =>
											handleInputChange('homeScore', e.target.value)
										}
									/>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='awayScore'>Away Team Score (optional)</Label>
									<Input
										id='awayScore'
										type='number'
										min='0'
										placeholder='Leave empty if not yet played'
										value={formData.awayScore}
										onChange={(e) =>
											handleInputChange('awayScore', e.target.value)
										}
									/>
								</div>
							</div>
						</form>
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={closeDialog}
							disabled={isSubmitting}
							type='button'
						>
							Cancel
						</Button>
						<Button type='submit' form='game-form' disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									{editingGameId ? 'Updating...' : 'Creating...'}
								</>
							) : (
								<>{editingGameId ? 'Update Game' : 'Create Game'}</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Game</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this game? This action cannot be
							undone.
						</DialogDescription>
					</DialogHeader>
					{gameToDelete && (
						<div className='py-4'>
							<p className='text-sm text-muted-foreground'>
								<strong>Date:</strong> {formatDate(gameToDelete.date)} at{' '}
								{formatTime(gameToDelete.date)}
							</p>
							<p className='text-sm text-muted-foreground'>
								<strong>Field:</strong> {gameToDelete.field}
							</p>
							<p className='text-sm text-muted-foreground'>
								<strong>Teams:</strong> {gameToDelete.home?.id || 'TBD'} vs{' '}
								{gameToDelete.away?.id || 'TBD'}
							</p>
							{gameToDelete.homeScore !== null &&
								gameToDelete.awayScore !== null && (
									<p className='text-sm text-muted-foreground'>
										<strong>Score:</strong> {gameToDelete.homeScore} -{' '}
										{gameToDelete.awayScore}
									</p>
								)}
						</div>
					)}
					<DialogFooter>
						<Button variant='outline' onClick={handleCancelDelete}>
							Cancel
						</Button>
						<Button variant='destructive' onClick={handleConfirmDelete}>
							Delete Game
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageContainer>
	)
}
