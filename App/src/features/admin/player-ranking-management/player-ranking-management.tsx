/**
 * Admin interface for Player Rankings calculations
 *
 * Allows administrators to trigger calculations and monitor progress
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import {
	playerRankingsCalculationsQuery,
	rebuildPlayerRankings,
	updatePlayerRankings,
} from '@/firebase/collections/player-rankings'
import { calculatedRoundsQuery } from '@/firebase/collections/calculated-rounds'
import { useSeasonsContext, useGamesContext } from '@/providers'
import {
	RankingsCalculationDocument,
	GameDocument,
	SeasonDocument,
	Timestamp,
} from '@/types'
import { logger } from '@/shared/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Play,
	RefreshCw,
	RefreshCcw,
	IterationCcw,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	Settings,
	ChevronLeft,
	ChevronRight,
	ArrowLeft,
	AlertTriangle,
} from 'lucide-react'

export const PlayerRankingManagement = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)

	const [isCalculating, setIsCalculating] = useState(false)
	const [calculationError, setCalculationError] = useState<string | null>(null)
	const [calculationSuccess, setCalculationSuccess] = useState<string | null>(
		null
	)

	// Pagination state for uncalculated games
	const [currentPage, setCurrentPage] = useState(1)
	const gamesPerPage = 20

	const isAdmin = playerSnapshot?.data()?.admin || false

	const [calculationsSnapshot, loading, error] = useCollection(
		playerRankingsCalculationsQuery()
	)

	// Fetch all games from context (will filter for completed games client-side)
	const {
		allGamesQuerySnapshot: allGamesSnapshot,
		allGamesQuerySnapshotLoading: allGamesLoading,
		allGamesQuerySnapshotError: allGamesError,
	} = useGamesContext()

	// Fetch calculated rounds
	const [
		calculatedRoundsSnapshot,
		calculatedRoundsLoading,
		calculatedRoundsError,
	] = useCollection(calculatedRoundsQuery())

	// Get seasons from context
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotError: seasonsError,
	} = useSeasonsContext()

	// Log and notify on query errors
	useEffect(() => {
		if (playerError) {
			logger.error('Failed to load player:', {
				component: 'PlayerRankingManagement',
				error: playerError.message,
			})
			toast.error('Failed to load player', {
				description: playerError.message,
			})
		}
	}, [playerError])

	useEffect(() => {
		if (error) {
			logger.error('Failed to load calculations:', {
				component: 'PlayerRankingManagement',
				error: error.message,
			})
			toast.error('Failed to load calculations', {
				description: error.message,
			})
		}
	}, [error])

	useEffect(() => {
		if (allGamesError) {
			logger.error('Failed to load games:', {
				component: 'PlayerRankingManagement',
				error: allGamesError.message,
			})
			toast.error('Failed to load games', {
				description: allGamesError.message,
			})
		}
	}, [allGamesError])

	useEffect(() => {
		if (calculatedRoundsError) {
			logger.error('Failed to load calculated rounds:', {
				component: 'PlayerRankingManagement',
				error: calculatedRoundsError.message,
			})
			toast.error('Failed to load calculated rounds', {
				description: calculatedRoundsError.message,
			})
		}
	}, [calculatedRoundsError])

	useEffect(() => {
		if (seasonsError) {
			logger.error('Failed to load seasons:', {
				component: 'PlayerRankingManagement',
				error: seasonsError.message,
			})
			toast.error('Failed to load seasons', {
				description: seasonsError.message,
			})
		}
	}, [seasonsError])

	const calculations = calculationsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (RankingsCalculationDocument & { id: string })[] | undefined

	// Process uncalculated games
	const uncalculatedGames = useMemo(() => {
		try {
			if (!allGamesSnapshot || !calculatedRoundsSnapshot || !seasonsSnapshot) {
				return []
			}

			const allGamesUnfiltered = allGamesSnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			})) as (GameDocument & { id: string })[]

			// Filter for completed games (both scores must be non-null) on client-side
			// This avoids Firestore's limitation of only one != filter per query
			const allGames = allGamesUnfiltered.filter(
				(game) =>
					game.homeScore !== null &&
					game.homeScore !== undefined &&
					game.awayScore !== null &&
					game.awayScore !== undefined
			)

			const calculatedRounds = calculatedRoundsSnapshot.docs.map((doc) =>
				doc.data()
			)
			const calculatedGameIds = new Set(
				calculatedRounds.flatMap((round) => round.gameIds || [])
			)

			const seasons = seasonsSnapshot.docs.reduce(
				(acc, doc) => {
					acc[doc.id] = doc.data() as SeasonDocument
					return acc
				},
				{} as Record<string, SeasonDocument>
			)

			return allGames
				.filter((game) => !calculatedGameIds.has(game.id))
				.map((game) => {
					const seasonId = game.season?.id || 'unknown'
					return {
						...game,
						seasonData: seasons[seasonId] || null,
					}
				})
				.sort((a, b) => {
					try {
						const aTime = a.date?.toDate?.()?.getTime() || 0
						const bTime = b.date?.toDate?.()?.getTime() || 0
						return bTime - aTime
					} catch (error) {
						logger.error('Error sorting games by date', error as Error)
						return 0
					}
				})
		} catch (error) {
			logger.error('Error processing uncalculated games', error as Error)
			return []
		}
	}, [allGamesSnapshot, calculatedRoundsSnapshot, seasonsSnapshot])

	// Pagination calculations for uncalculated games
	const totalGames = uncalculatedGames.length
	const totalPages = Math.ceil(totalGames / gamesPerPage)
	const startIndex = (currentPage - 1) * gamesPerPage
	const endIndex = startIndex + gamesPerPage
	const paginatedGames = uncalculatedGames.slice(startIndex, endIndex)

	const handlePreviousPage = () => {
		setCurrentPage((prev) => Math.max(prev - 1, 1))
	}

	const handleNextPage = () => {
		setCurrentPage((prev) => Math.min(prev + 1, totalPages))
	}

	const handlePageClick = (page: number) => {
		setCurrentPage(page)
	}

	const handleTriggerCalculation = async (type: 'full' | 'incremental') => {
		setIsCalculating(true)
		setCalculationError(null)
		setCalculationSuccess(null)

		try {
			const result =
				type === 'full'
					? await rebuildPlayerRankings({})
					: await updatePlayerRankings({})

			const typeDescription =
				type === 'full'
					? 'Full round-based recalculation'
					: 'Incremental new rounds processing'

			setCalculationSuccess(
				`${typeDescription} started successfully! ID: ${result.data.calculationId}`
			)
		} catch (err) {
			setCalculationError(
				err instanceof Error ? err.message : 'Failed to start calculation'
			)
		} finally {
			setIsCalculating(false)
		}
	}

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'pending':
				return <Clock className='h-4 w-4 text-yellow-500' />
			case 'running':
				return <RefreshCw className='h-4 w-4 text-blue-500 animate-spin' />
			case 'completed':
				return <CheckCircle className='h-4 w-4 text-green-500' />
			case 'failed':
				return <XCircle className='h-4 w-4 text-red-500' />
			default:
				return <AlertCircle className='h-4 w-4 text-gray-500' />
		}
	}

	const getStatusBadge = (status: string) => {
		const variants = {
			pending: 'secondary',
			running: 'default',
			completed: 'default',
			failed: 'destructive',
		} as const

		const colors = {
			pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
			running: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
			completed: 'bg-green-100 text-green-800 hover:bg-green-200',
			failed: 'bg-red-100 text-red-800 hover:bg-red-200',
		}

		return (
			<Badge
				variant={variants[status as keyof typeof variants] || 'secondary'}
				className={colors[status as keyof typeof colors] || ''}
			>
				{status.charAt(0).toUpperCase() + status.slice(1)}
			</Badge>
		)
	}

	const formatDate = (timestamp: Timestamp | null | undefined) => {
		if (!timestamp) return 'N/A'
		try {
			return timestamp.toDate().toLocaleString()
		} catch {
			return 'Invalid date'
		}
	}

	const formatGameDate = (date: Timestamp | null | undefined) => {
		try {
			if (date && typeof date.toDate === 'function') {
				return date.toDate().toLocaleDateString()
			}
			return 'Invalid Date'
		} catch (error) {
			logger.error('Error formatting game date', error as Error)
			return 'Invalid Date'
		}
	}

	const formatGameTime = (date: Timestamp | null | undefined) => {
		try {
			if (date && typeof date.toDate === 'function') {
				return date.toDate().toLocaleTimeString()
			}
			return 'Invalid Time'
		} catch (error) {
			logger.error('Error formatting game time', error as Error)
			return 'Invalid Time'
		}
	}

	const formatDuration = (
		startTime: Timestamp | null | undefined,
		endTime: Timestamp | null | undefined
	) => {
		if (!startTime) return 'N/A'

		try {
			const start = startTime.toDate()
			const end = endTime ? endTime.toDate() : new Date()
			const diffMs = end.getTime() - start.getTime()
			const diffMinutes = Math.floor(diffMs / 60000)
			const diffSeconds = Math.floor((diffMs % 60000) / 1000)

			if (diffMinutes > 0) {
				return `${diffMinutes}m ${diffSeconds}s`
			}
			return `${diffSeconds}s`
		} catch (error) {
			logger.error('Error calculating duration', error as Error)
			return 'N/A'
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
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Settings className='h-8 w-8' />
					Rankings Management
				</h1>
				<p className='text-muted-foreground'>
					Manage player ranking calculations and monitor system status
				</p>
			</div>

			{/* Back to Dashboard */}
			<div>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Status Alerts */}
			{calculationError && (
				<Alert variant='destructive'>
					<XCircle className='h-4 w-4' />
					<AlertDescription>{calculationError}</AlertDescription>
				</Alert>
			)}

			{calculationSuccess && (
				<Alert>
					<CheckCircle className='h-4 w-4' />
					<AlertDescription>{calculationSuccess}</AlertDescription>
				</Alert>
			)}

			{/* Calculation Controls */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Play className='h-5 w-5' />
						Trigger Rankings Calculation
					</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant={'outline'}
									onClick={() => handleTriggerCalculation('full')}
									disabled={isCalculating}
									className='flex items-center justify-center gap-2 w-full'
									size='lg'
								>
									{isCalculating ? (
										<RefreshCw className='h-4 w-4 animate-spin' />
									) : (
										<RefreshCcw className='h-4 w-4' />
									)}
									Rebuild Rankings (Full)
								</Button>
							</TooltipTrigger>
							<TooltipContent side='bottom' align='center'>
								<p className='max-w-xs'>
									Full rebuild from scratch. Processes all games
									chronologically. Use for first-time setup or when algorithm
									changes.
								</p>
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant='outline'
									onClick={() => handleTriggerCalculation('incremental')}
									disabled={isCalculating}
									className='flex items-center justify-center gap-2 w-full'
									size='lg'
								>
									{isCalculating ? (
										<RefreshCw className='h-4 w-4 animate-spin' />
									) : (
										<IterationCcw className='h-4 w-4' />
									)}
									Update Rankings (Incremental)
								</Button>
							</TooltipTrigger>
							<TooltipContent side='bottom' align='center'>
								<p className='max-w-xs'>
									Incremental update processing only new rounds. Use for regular
									updates after adding new games.
								</p>
							</TooltipContent>
						</Tooltip>
					</div>
				</CardContent>
			</Card>

			{/* Calculation History */}
			<Card>
				<CardHeader>
					<CardTitle>Calculation History</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className='text-center py-8'>
							<RefreshCw className='h-8 w-8 animate-spin mx-auto mb-4' />
							<p>Loading calculation history...</p>
						</div>
					) : error ? (
						<Alert variant='destructive'>
							<XCircle className='h-4 w-4' />
							<AlertDescription>
								Error loading calculations: {error.message}
							</AlertDescription>
						</Alert>
					) : calculations && calculations.length > 0 ? (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Type</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Progress</TableHead>
										<TableHead>Started</TableHead>
										<TableHead>Duration</TableHead>
										<TableHead>Triggered By</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{calculations.map((calc) => (
										<TableRow key={calc.id}>
											<TableCell>
												<Badge variant='outline'>{calc.calculationType}</Badge>
											</TableCell>
											<TableCell>
												<div className='flex items-center gap-2'>
													{getStatusIcon(calc.status)}
													{getStatusBadge(calc.status)}
												</div>
											</TableCell>
											<TableCell>
												<div className='space-y-2 min-w-[200px]'>
													<div className='flex justify-between text-sm'>
														<span>{calc.progress.currentStep}</span>
														<span>{calc.progress.percentComplete}%</span>
													</div>
													<Progress
														value={calc.progress.percentComplete}
														className='h-2'
													/>
													{calc.progress.currentSeason && (
														<div className='text-xs text-muted-foreground'>
															Season {calc.progress.seasonsProcessed + 1}/
															{calc.progress.totalSeasons}
														</div>
													)}
												</div>
											</TableCell>
											<TableCell className='text-sm'>
												{formatDate(calc.startedAt)}
											</TableCell>
											<TableCell className='text-sm'>
												{formatDuration(calc.startedAt, calc.completedAt)}
											</TableCell>
											<TableCell className='text-sm'>
												{calc.triggeredBy || 'System'}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className='text-center py-8'>
							<AlertCircle className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-muted-foreground'>No calculations found.</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Start your first calculation using the controls above.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Uncalculated Games */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Clock className='h-5 w-5' />
						Games Pending Calculation
					</CardTitle>
				</CardHeader>
				<CardContent>
					{allGamesLoading || calculatedRoundsLoading ? (
						<div className='text-center py-8'>
							<RefreshCw className='h-8 w-8 animate-spin mx-auto mb-4' />
							<p>Loading uncalculated games...</p>
						</div>
					) : allGamesError ? (
						<Alert variant='destructive'>
							<XCircle className='h-4 w-4' />
							<AlertDescription>
								Error loading games: {allGamesError.message}
							</AlertDescription>
						</Alert>
					) : uncalculatedGames && uncalculatedGames.length > 0 ? (
						<div className='space-y-4'>
							<div className='flex items-center justify-between'>
								<div className='flex items-center gap-2 text-sm text-muted-foreground'>
									<AlertCircle className='h-4 w-4' />
									<span>
										{totalGames} game{totalGames !== 1 ? 's' : ''} haven't been
										processed yet
									</span>
								</div>
								{totalPages > 1 && (
									<div className='text-sm text-muted-foreground'>
										Page {currentPage} of {totalPages}
									</div>
								)}
							</div>
							<div className='overflow-x-auto'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Timestamp</TableHead>
											<TableHead>Season</TableHead>
											<TableHead>Teams</TableHead>
											<TableHead>Score</TableHead>
											<TableHead>Field</TableHead>
											<TableHead>Type</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paginatedGames.map((game) => (
											<TableRow key={game.id}>
												<TableCell className='text-sm'>
													<div className='space-y-1'>
														<div className='font-medium'>
															{formatGameDate(game.date)}
														</div>
														<div className='text-xs text-muted-foreground'>
															{formatGameTime(game.date)}
														</div>
													</div>
												</TableCell>
												<TableCell>
													<Badge variant='outline' className='text-xs'>
														{game.seasonData?.name || 'Unknown Season'}
													</Badge>
												</TableCell>
												<TableCell className='text-sm'>
													<div className='space-y-1'>
														<div className='font-medium text-xs'>
															Home: {game.home?.id || 'TBD'}
														</div>
														<div className='font-medium text-xs'>
															Away: {game.away?.id || 'TBD'}
														</div>
													</div>
												</TableCell>
												<TableCell className='text-sm font-medium'>
													{game.homeScore ?? 'N/A'} - {game.awayScore ?? 'N/A'}
												</TableCell>
												<TableCell className='text-sm'>
													<Badge variant='outline' className='text-xs'>
														Field {game.field || 'N/A'}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge
														variant={
															game.type === 'playoff' ? 'default' : 'secondary'
														}
														className='text-xs'
													>
														{game.type === 'playoff' ? 'Playoff' : 'Regular'}
													</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{totalPages > 1 && (
								<div className='flex items-center justify-between pt-4'>
									<div className='text-sm text-muted-foreground'>
										Showing {startIndex + 1}-{Math.min(endIndex, totalGames)} of{' '}
										{totalGames} games
									</div>
									<div className='flex items-center gap-2'>
										<Button
											variant='outline'
											size='sm'
											onClick={handlePreviousPage}
											disabled={currentPage === 1}
											className='flex items-center gap-1'
										>
											<ChevronLeft className='h-4 w-4' />
											Previous
										</Button>

										<div className='flex items-center gap-1'>
											{Array.from(
												{ length: Math.min(totalPages, 5) },
												(_, i) => {
													const pageNum =
														Math.max(
															1,
															Math.min(totalPages - 4, currentPage - 2)
														) + i
													if (pageNum > totalPages) return null

													return (
														<Button
															key={pageNum}
															variant={
																pageNum === currentPage ? 'default' : 'outline'
															}
															size='sm'
															onClick={() => handlePageClick(pageNum)}
															className='min-w-8'
														>
															{pageNum}
														</Button>
													)
												}
											)}
										</div>

										<Button
											variant='outline'
											size='sm'
											onClick={handleNextPage}
											disabled={currentPage === totalPages}
											className='flex items-center gap-1'
										>
											Next
											<ChevronRight className='h-4 w-4' />
										</Button>
									</div>
								</div>
							)}
						</div>
					) : (
						<div className='text-center py-8'>
							<CheckCircle className='h-12 w-12 text-green-500 mx-auto mb-4' />
							<p className='text-muted-foreground'>
								All games have been calculated!
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								No games are pending calculation.
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export default PlayerRankingManagement
