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
import { ArrowLeft, Edit, Trash2, Calendar, AlertTriangle } from 'lucide-react'
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
import { GameDocument, SeasonDocument, TeamDocument } from '@/types'

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
	const [filterSeasonId, setFilterSeasonId] = useState<string>('')

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

	// Set current season as default when it loads
	useEffect(() => {
		if (currentSeasonQueryDocumentSnapshot && !formData.seasonId) {
			setFormData((prev) => ({
				...prev,
				seasonId: currentSeasonQueryDocumentSnapshot.id,
			}))
		}
	}, [currentSeasonQueryDocumentSnapshot, formData.seasonId])

	// Set current season as default filter
	useEffect(() => {
		if (currentSeasonQueryDocumentSnapshot && !filterSeasonId) {
			setFilterSeasonId(currentSeasonQueryDocumentSnapshot.id)
		}
	}, [currentSeasonQueryDocumentSnapshot, filterSeasonId])

	const handleInputChange = (field: keyof GameFormData, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	// Generate Saturdays for November and December of current year
	const getSaturdays = () => {
		const saturdays: { date: string; display: string }[] = []
		const year = new Date().getFullYear()

		for (let month = 10; month <= 11; month++) {
			// 10 = November, 11 = December
			const daysInMonth = new Date(year, month + 1, 0).getDate()

			for (let day = 1; day <= daysInMonth; day++) {
				const date = new Date(year, month, day)
				if (date.getDay() === 6) {
					// 6 = Saturday
					const dateStr = format(date, 'yyyy-MM-dd')
					const displayStr = format(date, 'MMMM d, yyyy')
					saturdays.push({ date: dateStr, display: displayStr })
				}
			}
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

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

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

				// Reset only teams and scores, keep select values
				setFormData((prev) => ({
					...prev,
					homeTeamId: '',
					awayTeamId: '',
					homeScore: '',
					awayScore: '',
				}))
				return
			}

			// Reset form completely for edit mode
			setFormData(INITIAL_FORM_DATA)
			setEditingGameId(null)
		} catch (error) {
			console.error('Error saving game:', error)
			toast.error('Error', {
				description:
					error instanceof Error ? error.message : 'Failed to save game',
			})
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
	}

	const handleCancelEdit = () => {
		setFormData(INITIAL_FORM_DATA)
		setEditingGameId(null)
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
			console.error('Error deleting game:', error)
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

	const formatDate = (timestamp: any) => {
		const date = timestamp.toDate()
		return format(date, 'MMM dd, yyyy')
	}

	const formatTime = (timestamp: any) => {
		const date = timestamp.toDate()
		return format(date, 'h:mm a')
	}

	const filteredGames = games
		? games.filter(
				(game) => !filterSeasonId || game.season.id === filterSeasonId
			)
		: []

	const sortedGames = filteredGames.length
		? [...filteredGames].sort((a, b) => a.date.toMillis() - b.date.toMillis())
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
		<PageContainer>
			<div className='mb-6'>
				<Button variant='ghost' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			<PageHeader
				title='Game Management'
				description='Create, edit, and manage game schedules for all seasons'
				icon={Calendar}
			/>

			<div className='space-y-6'>
				<Card>
					<CardHeader>
						<CardTitle>
							{editingGameId ? 'Edit Game' : 'Create New Game'}
						</CardTitle>
						<CardDescription>
							{editingGameId
								? 'Update the game details below'
								: 'Enter the game details below. Leave scores empty to create a game before it is played.'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className='space-y-4'>
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
											<SelectItem value='TBD'></SelectItem>
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
											<SelectItem value='TBD'></SelectItem>
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

							<div className='flex gap-2'>
								<Button type='submit'>
									{editingGameId ? 'Update Game' : 'Create Game'}
								</Button>
								{editingGameId && (
									<Button
										type='button'
										variant='outline'
										onClick={handleCancelEdit}
									>
										Cancel
									</Button>
								)}
							</div>
						</form>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className='flex items-center justify-between'>
							<div>
								<CardTitle>All Games</CardTitle>
								<CardDescription>
									View and manage all games in the system
								</CardDescription>
							</div>
							<div className='w-64'>
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
						</div>
					</CardHeader>
					<CardContent>
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
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedGames.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={8}
												className='text-center text-muted-foreground'
											>
												No games found
											</TableCell>
										</TableRow>
									) : (
										sortedGames.map((game) => (
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
													{game.homeScore !== null &&
													game.awayScore !== null ? (
														`${game.homeScore} - ${game.awayScore}`
													) : (
														<span className='text-muted-foreground'>
															Not played yet
														</span>
													)}
												</TableCell>
												<TableCell className='capitalize'>
													{game.type}
												</TableCell>
												<TableCell>
													<div className='flex gap-1'>
														<Button
															size='sm'
															variant='ghost'
															onClick={() => handleEditGame(game)}
															title='Edit game'
														>
															<Edit className='h-4 w-4' />
														</Button>
														<Button
															size='sm'
															variant='ghost'
															onClick={() => handleDeleteClick(game)}
															title='Delete game'
															className='text-destructive hover:text-destructive'
														>
															<Trash2 className='h-4 w-4' />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			</div>

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
