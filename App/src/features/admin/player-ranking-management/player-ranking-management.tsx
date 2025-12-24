/**
 * Admin interface for managing player ranking calculations
 *
 * Allows administrators to trigger TrueSkill calculations and monitor progress.
 * Only full rebuilds are supported to ensure accurate sigma (uncertainty) tracking.
 */

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import {
	playerRankingsCalculationsQuery,
	rebuildPlayerRankings,
} from '@/firebase/collections/player-rankings'
import { RankingsCalculationDocument, Timestamp } from '@/types'
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
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	Settings,
	ArrowLeft,
	AlertTriangle,
	Info,
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

	const isAdmin = playerSnapshot?.data()?.admin || false

	const [calculationsSnapshot, loading, error] = useCollection(
		playerRankingsCalculationsQuery()
	)

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

	const calculations = calculationsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (RankingsCalculationDocument & { id: string })[] | undefined

	const handleRebuildRankings = async () => {
		setIsCalculating(true)
		setCalculationError(null)
		setCalculationSuccess(null)

		try {
			const result = await rebuildPlayerRankings({})

			setCalculationSuccess(
				`Full TrueSkill recalculation started successfully! ID: ${result.data.calculationId}`
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
				return <Clock className='h-4 w-4 text-yellow-500' aria-hidden='true' />
			case 'running':
				return (
					<RefreshCw
						className='h-4 w-4 text-blue-500 animate-spin'
						aria-hidden='true'
					/>
				)
			case 'completed':
				return (
					<CheckCircle className='h-4 w-4 text-green-500' aria-hidden='true' />
				)
			case 'failed':
				return <XCircle className='h-4 w-4 text-red-500' aria-hidden='true' />
			default:
				return (
					<AlertCircle className='h-4 w-4 text-gray-500' aria-hidden='true' />
				)
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

	// Time constants for duration formatting
	const MS_PER_MINUTE = 60000
	const MS_PER_SECOND = 1000

	const formatDuration = (
		startTime: Timestamp | null | undefined,
		endTime: Timestamp | null | undefined
	) => {
		if (!startTime) return 'N/A'

		try {
			const start = startTime.toDate()
			const end = endTime ? endTime.toDate() : new Date()
			const diffMs = end.getTime() - start.getTime()
			const diffMinutes = Math.floor(diffMs / MS_PER_MINUTE)
			const diffSeconds = Math.floor((diffMs % MS_PER_MINUTE) / MS_PER_SECOND)

			if (diffMinutes > 0) {
				return `${diffMinutes}m ${diffSeconds}s`
			}
			return `${diffSeconds}s`
		} catch (err) {
			logger.error('Error calculating duration', err as Error)
			return 'N/A'
		}
	}

	// Handle authentication and data loading
	if (playerLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<RefreshCw
							className='h-8 w-8 animate-spin mx-auto mb-4'
							aria-hidden='true'
						/>
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
							<AlertTriangle className='h-6 w-6' aria-hidden='true' />
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
					<Settings className='h-8 w-8' aria-hidden='true' />
					Rankings Management
				</h1>
				<p className='text-muted-foreground'>
					Manage TrueSkill player ranking calculations and monitor system status
				</p>
			</div>

			{/* Back to Dashboard */}
			<div>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' aria-hidden='true' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Status Alerts */}
			{calculationError && (
				<Alert variant='destructive' role='alert'>
					<XCircle className='h-4 w-4' aria-hidden='true' />
					<AlertDescription>{calculationError}</AlertDescription>
				</Alert>
			)}

			{calculationSuccess && (
				<Alert role='status'>
					<CheckCircle className='h-4 w-4' aria-hidden='true' />
					<AlertDescription>{calculationSuccess}</AlertDescription>
				</Alert>
			)}

			{/* TrueSkill Info Card */}
			<Card className='border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'>
				<CardContent className='p-4'>
					<div className='flex gap-3'>
						<Info
							className='h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5'
							aria-hidden='true'
						/>
						<div className='space-y-1'>
							<p className='font-medium text-blue-900 dark:text-blue-100'>
								TrueSkill Rating System
							</p>
							<p className='text-sm text-blue-700 dark:text-blue-300'>
								Player rankings use the TrueSkill algorithm which tracks both
								skill (μ) and uncertainty (σ). Full rebuilds process all games
								chronologically to ensure accurate sigma values are maintained.
								This produces the most reliable rankings.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Calculation Controls */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Play className='h-5 w-5' aria-hidden='true' />
						Rebuild Player Rankings
					</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<p className='text-sm text-muted-foreground'>
						Recalculates all player rankings from scratch using the TrueSkill
						algorithm. This processes all historical games in chronological
						order.
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={handleRebuildRankings}
								disabled={isCalculating}
								className='flex items-center justify-center gap-2'
								size='lg'
								aria-busy={isCalculating}
							>
								{isCalculating ? (
									<RefreshCw
										className='h-4 w-4 animate-spin'
										aria-hidden='true'
									/>
								) : (
									<RefreshCcw className='h-4 w-4' aria-hidden='true' />
								)}
								{isCalculating ? 'Starting...' : 'Rebuild All Rankings'}
							</Button>
						</TooltipTrigger>
						<TooltipContent side='bottom' align='start'>
							<p className='max-w-xs'>
								Full rebuild from scratch. Processes all games chronologically
								to calculate accurate TrueSkill ratings.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardContent>
			</Card>

			{/* Calculation History */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Clock className='h-5 w-5' aria-hidden='true' />
						Calculation History
					</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div
							className='space-y-4'
							role='status'
							aria-label='Loading calculation history'
						>
							{/* Skeleton loading for table rows */}
							{Array.from({ length: 3 }, (_, i) => (
								<div
									key={i}
									className='flex items-center gap-4 p-3 border rounded-lg animate-pulse'
								>
									<div className='h-6 w-24 bg-muted rounded' />
									<div className='h-6 w-20 bg-muted rounded' />
									<div className='flex-1 space-y-2'>
										<div className='h-4 w-full bg-muted rounded' />
										<div className='h-2 w-3/4 bg-muted rounded' />
									</div>
									<div className='h-4 w-32 bg-muted rounded' />
									<div className='h-4 w-16 bg-muted rounded' />
								</div>
							))}
							<p className='sr-only'>Loading calculation history...</p>
						</div>
					) : error ? (
						<Alert variant='destructive' role='alert'>
							<XCircle className='h-4 w-4' aria-hidden='true' />
							<AlertDescription>
								Error loading calculations: {error.message}
							</AlertDescription>
						</Alert>
					) : calculations && calculations.length > 0 ? (
						<div className='overflow-x-auto'>
							<Table aria-label='Ranking calculation history'>
								<TableHeader>
									<TableRow>
										<TableHead scope='col'>Type</TableHead>
										<TableHead scope='col'>Status</TableHead>
										<TableHead scope='col'>Progress</TableHead>
										<TableHead scope='col'>Started</TableHead>
										<TableHead scope='col'>Duration</TableHead>
										<TableHead scope='col'>Triggered By</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{calculations.map((calc) => (
										<TableRow key={calc.id}>
											<TableCell>
												<Badge variant='outline'>
													{calc.calculationType === 'fresh'
														? 'Full Rebuild'
														: calc.calculationType}
												</Badge>
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
														aria-label={`${calc.progress.percentComplete}% complete`}
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
						<div className='text-center py-8' role='status' aria-live='polite'>
							<AlertCircle
								className='h-12 w-12 text-muted-foreground mx-auto mb-4'
								aria-hidden='true'
							/>
							<p className='text-lg font-medium text-muted-foreground'>
								No calculations found
							</p>
							<p className='text-sm text-muted-foreground mt-2 mb-4'>
								Player rankings haven't been calculated yet. Run your first
								TrueSkill calculation to generate the leaderboard.
							</p>
							<Button
								onClick={handleRebuildRankings}
								disabled={isCalculating}
								size='sm'
								aria-busy={isCalculating}
							>
								{isCalculating ? (
									<RefreshCw
										className='h-4 w-4 animate-spin mr-2'
										aria-hidden='true'
									/>
								) : (
									<Play className='h-4 w-4 mr-2' aria-hidden='true' />
								)}
								{isCalculating ? 'Starting...' : 'Run First Calculation'}
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export default PlayerRankingManagement
