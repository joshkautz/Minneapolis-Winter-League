/**
 * Admin interface for Player Rankings calculations
 *
 * Allows administrators to trigger calculations and monitor progress
 */

import React, { useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import {
	playerRankingsCalculationsQuery,
	triggerPlayerRankingsCalculation,
} from '@/firebase/collections/player-rankings'
import { RankingsCalculationDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	Settings,
	AlertTriangle,
} from 'lucide-react'

export const PlayerRankingsAdmin: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false
	const [isCalculating, setIsCalculating] = useState(false)
	const [calculationError, setCalculationError] = useState<string | null>(null)
	const [calculationSuccess, setCalculationSuccess] = useState<string | null>(
		null
	)

	const [calculationsSnapshot, loading, error] = useCollection(
		playerRankingsCalculationsQuery()
	)

	const calculations = calculationsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (RankingsCalculationDocument & { id: string })[] | undefined

	// Handle authentication loading
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
							You don't have permission to access the Player Rankings admin
							interface.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	const handleTriggerCalculation = async (type: 'full' | 'incremental') => {
		setIsCalculating(true)
		setCalculationError(null)
		setCalculationSuccess(null)

		try {
			const result = await triggerPlayerRankingsCalculation({
				calculationType: type,
			})

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

	const formatDate = (timestamp: any) => {
		if (!timestamp) return 'N/A'
		try {
			return timestamp.toDate().toLocaleString()
		} catch {
			return 'Invalid date'
		}
	}

	const formatDuration = (startTime: any, endTime: any) => {
		if (!startTime) return 'N/A'

		const start = startTime.toDate()
		const end = endTime ? endTime.toDate() : new Date()
		const diffMs = end.getTime() - start.getTime()
		const diffMinutes = Math.floor(diffMs / 60000)
		const diffSeconds = Math.floor((diffMs % 60000) / 1000)

		if (diffMinutes > 0) {
			return `${diffMinutes}m ${diffSeconds}s`
		}
		return `${diffSeconds}s`
	}

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Settings className='h-8 w-8' />
					Player Rankings Administration
				</h1>
				<p className='text-muted-foreground'>
					Manage player rankings calculations and monitor system status
				</p>
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
						Trigger New Calculation
					</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<p className='text-sm text-muted-foreground'>
						Choose the type of calculation to perform.{' '}
						<strong>Full calculations</strong> rebuild all rankings from scratch
						using round-based processing.{' '}
						<strong>Incremental calculations</strong>
						process only new rounds that haven't been calculated yet.
					</p>

					<div className='flex gap-4'>
						<Button
							onClick={() => handleTriggerCalculation('full')}
							disabled={isCalculating}
							className='flex items-center gap-2'
						>
							{isCalculating ? (
								<RefreshCw className='h-4 w-4 animate-spin' />
							) : (
								<Play className='h-4 w-4' />
							)}
							Full Recalculation
						</Button>

						<Button
							variant='outline'
							onClick={() => handleTriggerCalculation('incremental')}
							disabled={isCalculating}
							className='flex items-center gap-2'
						>
							{isCalculating ? (
								<RefreshCw className='h-4 w-4 animate-spin' />
							) : (
								<RefreshCw className='h-4 w-4' />
							)}
							New Rounds Only
						</Button>
					</div>

					<div className='text-xs text-muted-foreground space-y-1'>
						<p>
							<strong>Full:</strong> Use for first-time setup or when algorithm
							changes
						</p>
						<p>
							<strong>Incremental:</strong> Use for weekly updates after adding
							new games
						</p>
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
		</div>
	)
}
