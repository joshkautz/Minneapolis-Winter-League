/**
 * PlayerRankingHistory component
 *
 * Displays a player's rankings history throughout their career using interactive charts
 * Accessible at /player-rankings/player/{playerId}
 */

import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { collection, Query } from 'firebase/firestore'

import { firestore } from '@/firebase/app'
import { PlayerDocument, Collections, RankingHistoryDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from '@/components/ui/chart'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Trophy, ArrowLeft } from 'lucide-react'

interface PlayerRankingHistoryProps {
	/** Optional class name for styling */
	className?: string
}

interface ChartDataPoint {
	/** Date in ISO timestamp format for display */
	date: string
	/** Player's rank position (inverted for display) */
	ranking: number
	/** Player's Elo rating */
	eloRating: number
	/** Player's actual rank position */
	rank: number
	/** Season identifier */
	season: string
	/** Unix timestamp for sorting */
	timestamp: number
}

const chartConfig = {
	ranking: {
		label: 'Rank Position',
		color: 'var(--chart-1)',
	},
	eloRating: {
		label: 'Elo Rating',
		color: 'var(--chart-2)',
	},
} satisfies ChartConfig

export function PlayerRankingHistory({ className }: PlayerRankingHistoryProps) {
	const { playerId } = useParams<{ playerId: string }>()
	const navigate = useNavigate()

	// Handle missing playerId
	if (!playerId) {
		return (
			<div className='container max-w-4xl mx-auto py-8'>
				<Alert variant='destructive'>
					<AlertDescription>
						Player ID is required to view rankings history.
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	// Fetch all players for the dropdown
	const [allPlayersSnapshot, allPlayersLoading] = useCollection(
		collection(firestore, Collections.PLAYERS) as Query<PlayerDocument>
	)

	// Fetch all rankings history data from rankings-history collection
	const [rankingHistorySnapshot, historyLoading, error] = useCollection(
		collection(firestore, 'rankings-history') as Query<RankingHistoryDocument>
	)

	const loading = historyLoading || allPlayersLoading

	// Get all players for dropdown - only include players with rankings history data
	const allPlayers = useMemo(() => {
		if (!allPlayersSnapshot?.docs || !rankingHistorySnapshot?.docs) return []

		// Get unique player IDs from rankings history data
		const playersWithHistory = new Set<string>()

		rankingHistorySnapshot.docs.forEach((doc) => {
			const data = doc.data()
			const rankings = data.rankings || []
			if (Array.isArray(rankings)) {
				rankings.forEach((player: any) => {
					if (player.playerId) {
						playersWithHistory.add(player.playerId)
					}
				})
			}
		})

		// Filter players to only include those with rankings history
		return allPlayersSnapshot.docs
			.filter((doc) => playersWithHistory.has(doc.id))
			.map((doc) => ({
				id: doc.id,
				name:
					`${doc.data().firstname || ''} ${doc.data().lastname || ''}`.trim() ||
					'Unknown Player',
			}))
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [allPlayersSnapshot, rankingHistorySnapshot])

	// Handle player selection change
	const handlePlayerChange = (newPlayerId: string) => {
		navigate(`/player-rankings/player/${newPlayerId}`)
	}

	// Process data to extract player's history
	const chartData = useMemo(() => {
		if (!rankingHistorySnapshot?.docs) return []

		const playerHistory: ChartDataPoint[] = []

		rankingHistorySnapshot.docs.forEach((doc) => {
			const docId = doc.id
			const data = doc.data()

			// Only process round-based snapshots (with roundMeta)
			// Skip any legacy weekly snapshots that might still exist
			if (!data.roundMeta) return

			// Parse document ID format: {timestamp}_{seasonId}
			const idParts = docId.split('_')
			if (idParts.length < 2) return

			const timestamp = parseInt(idParts[0])
			const seasonId = idParts[1]

			if (isNaN(timestamp)) return

			// Find player in the rankings array
			const rankings = data.rankings || []
			if (!Array.isArray(rankings)) return

			const playerData = rankings.find(
				(player: any) => player.playerId === playerId
			)

			if (!playerData) return

			const playerRank = playerData.rank
			if (typeof playerRank !== 'number' || playerRank <= 0) return

			// Get the round date
			let roundDate: Date
			if (data.roundMeta?.roundStartTime) {
				if (typeof data.roundMeta.roundStartTime.toDate === 'function') {
					roundDate = data.roundMeta.roundStartTime.toDate()
				} else if (data.roundMeta.roundStartTime instanceof Date) {
					roundDate = data.roundMeta.roundStartTime
				} else if (data.roundMeta.roundStartTime.seconds) {
					roundDate = new Date(
						data.roundMeta.roundStartTime.seconds * 1000 +
							(data.roundMeta.roundStartTime.nanoseconds || 0) / 1000000
					)
				} else {
					roundDate = new Date(timestamp)
				}
			} else {
				roundDate = new Date(timestamp)
			}

			if (isNaN(roundDate.getTime())) return

			// Create one data point per round
			playerHistory.push({
				date: roundDate.toISOString(),
				rank: playerRank,
				ranking: playerRank,
				eloRating: parseFloat((playerData.eloRating || 0).toFixed(5)),
				season: seasonId,
				timestamp: roundDate.getTime(),
			})
		})

		// Sort by timestamp to ensure proper chronological order
		return playerHistory.sort((a, b) => a.timestamp - b.timestamp)
	}, [rankingHistorySnapshot, playerId])

	if (loading) {
		return (
			<div className='container max-w-6xl mx-auto py-8 space-y-6'>
				{/* Back button skeleton */}
				<div className='flex items-center gap-4'>
					<div className='h-8 w-32 rounded-md bg-gray-200 animate-pulse relative overflow-hidden'>
						<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
					</div>
				</div>

				<Card className={`${className} pt-0`}>
					{/* Header skeleton that matches the real layout */}
					<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
						<div className='grid flex-1 gap-1'>
							<div className='flex items-center gap-2'>
								<Trophy className='h-5 w-5 text-gray-300' />
								<div className='h-6 w-32 rounded bg-gray-200 animate-pulse relative overflow-hidden'>
									<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
								</div>
							</div>
						</div>
						{/* Player selector skeleton */}
						<div className='hidden h-9 w-[200px] rounded-lg bg-gray-200 animate-pulse sm:ml-auto sm:flex relative overflow-hidden'>
							<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
						</div>
					</CardHeader>

					{/* Chart content skeleton */}
					<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
						<div className='aspect-auto h-[250px] w-full'>
							{/* Chart area with subtle grid pattern to simulate chart */}
							<div className='h-full w-full rounded-lg border bg-gray-50 relative overflow-hidden'>
								{/* Simulate chart grid lines */}
								<div className='absolute inset-0 opacity-30'>
									{/* Horizontal lines */}
									{Array.from({ length: 5 }).map((_, i) => (
										<div
											key={`h-${i}`}
											className='absolute w-full border-t border-gray-300'
											style={{ top: `${(i + 1) * 20}%` }}
										/>
									))}
									{/* Vertical lines */}
									{Array.from({ length: 6 }).map((_, i) => (
										<div
											key={`v-${i}`}
											className='absolute h-full border-l border-gray-300'
											style={{ left: `${(i + 1) * 16.66}%` }}
										/>
									))}
								</div>

								{/* Simulate chart curves */}
								<div className='absolute inset-4 flex items-end justify-between'>
									{Array.from({ length: 8 }).map((_, i) => (
										<div
											key={i}
											className='flex flex-col items-center space-y-1'
										>
											<div
												className='w-2 bg-gray-300 animate-pulse relative overflow-hidden'
												style={{ height: `${Math.random() * 60 + 20}%` }}
											>
												<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
											</div>
										</div>
									))}
								</div>

								{/* Main shimmer overlay for the entire chart area */}
								<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer' />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (error) {
		return (
			<div className='container max-w-6xl mx-auto py-8 space-y-6'>
				{/* Back button */}
				<div className='flex items-center gap-4'>
					<Button
						variant='outline'
						size='sm'
						onClick={() => navigate('/player-rankings')}
						className='flex items-center gap-2'
					>
						<ArrowLeft className='h-4 w-4' />
						Back to Player Rankings
					</Button>
				</div>

				<Card className={`${className} pt-0`}>
					<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
						<div className='grid flex-1 gap-1'>
							<CardTitle className='flex items-center gap-2'>
								<Trophy className='h-5 w-5' />
								Rankings history
							</CardTitle>
						</div>
						<div className='flex items-center gap-2'>
							<Select value={playerId} onValueChange={handlePlayerChange}>
								<SelectTrigger
									className='hidden w-[200px] rounded-lg sm:ml-auto sm:flex'
									aria-label='Select a player'
								>
									<SelectValue placeholder='Select player' />
								</SelectTrigger>
								<SelectContent className='rounded-xl'>
									{allPlayers.map((player) => (
										<SelectItem
											key={player.id}
											value={player.id}
											className='rounded-lg'
										>
											{player.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
						<Alert variant='destructive'>
							<AlertDescription>
								Failed to load rankings history. Please try again later.
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (chartData.length === 0) {
		return (
			<div className='container max-w-6xl mx-auto py-8 space-y-6'>
				{/* Back button */}
				<div className='flex items-center gap-4'>
					<Button
						variant='outline'
						size='sm'
						onClick={() => navigate('/player-rankings')}
						className='flex items-center gap-2'
					>
						<ArrowLeft className='h-4 w-4' />
						Back to Player Rankings
					</Button>
				</div>

				<Card className={`${className} pt-0`}>
					<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
						<div className='grid flex-1 gap-1'>
							<CardTitle className='flex items-center gap-2'>
								<Trophy className='h-5 w-5' />
								Rankings history
							</CardTitle>
						</div>
						<div className='flex items-center gap-2'>
							<Select value={playerId} onValueChange={handlePlayerChange}>
								<SelectTrigger
									className='hidden w-[200px] rounded-lg sm:ml-auto sm:flex'
									aria-label='Select a player'
								>
									<SelectValue placeholder='Select player' />
								</SelectTrigger>
								<SelectContent className='rounded-xl'>
									{allPlayers.map((player) => (
										<SelectItem
											key={player.id}
											value={player.id}
											className='rounded-lg'
										>
											{player.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
						<Alert>
							<AlertDescription>
								No rankings history data available for this player.
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className='container max-w-6xl mx-auto py-8 space-y-6'>
			{/* Back button */}
			<div className='flex items-center gap-4'>
				<Button
					variant='outline'
					size='sm'
					onClick={() => navigate('/player-rankings')}
					className='flex items-center gap-2'
				>
					<ArrowLeft className='h-4 w-4' />
					Back to Player Rankings
				</Button>
			</div>

			<Card className={`${className} pt-0`}>
				<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
					<div className='grid flex-1 gap-1'>
						<CardTitle className='flex items-center gap-2'>
							<Trophy className='h-5 w-5' />
							Rankings history
						</CardTitle>
					</div>
					<div className='flex items-center gap-2'>
						<Select value={playerId} onValueChange={handlePlayerChange}>
							<SelectTrigger
								className='hidden w-[200px] rounded-lg sm:ml-auto sm:flex'
								aria-label='Select a player'
							>
								<SelectValue placeholder='Select player' />
							</SelectTrigger>
							<SelectContent className='rounded-xl'>
								{allPlayers.map((player) => (
									<SelectItem
										key={player.id}
										value={player.id}
										className='rounded-lg'
									>
										{player.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
					<ChartContainer
						config={chartConfig}
						className='aspect-auto h-[250px] w-full'
					>
						<AreaChart data={chartData}>
							<defs>
								<linearGradient id='fillRanking' x1='0' y1='0' x2='0' y2='1'>
									<stop
										offset='5%'
										stopColor='var(--color-ranking)'
										stopOpacity={0.8}
									/>
									<stop
										offset='95%'
										stopColor='var(--color-ranking)'
										stopOpacity={0.1}
									/>
								</linearGradient>
								<linearGradient id='fillEloRating' x1='0' y1='0' x2='0' y2='1'>
									<stop
										offset='5%'
										stopColor='var(--color-eloRating)'
										stopOpacity={0.8}
									/>
									<stop
										offset='95%'
										stopColor='var(--color-eloRating)'
										stopOpacity={0.1}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid vertical={true} />
							<XAxis
								dataKey='date'
								tickLine={true}
								axisLine={true}
								tickMargin={8}
								minTickGap={32}
								tickFormatter={(value) => {
									const date = new Date(value)
									return date.toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									})
								}}
							/>
							<YAxis
								yAxisId='ranking'
								orientation='left'
								tickLine={true}
								axisLine={true}
								domain={[0, 'dataMax + 5']}
							/>
							<YAxis
								yAxisId='eloRating'
								orientation='right'
								tickLine={true}
								axisLine={true}
								domain={['dataMin - 5', 'dataMax + 5']}
								tickFormatter={(value) => Math.round(value).toString()}
							/>
							<ChartTooltip
								cursor={false}
								content={(props) => {
									if (
										!props.active ||
										!props.payload ||
										props.payload.length === 0 ||
										!props.label
									) {
										return null
									}

									const data = props.payload[0].payload

									// Format the date and time from the data point
									const dateTime = new Date(data.date)
									const formattedDate = dateTime.toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									})
									const formattedTime = dateTime.toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit',
										hour12: true,
									})

									return (
										<div className='rounded-lg border bg-background p-3 shadow-md'>
											<div className='mb-2'>
												<p className='text-sm font-medium'>
													{formattedDate} • {formattedTime}
												</p>
											</div>
											<div className='space-y-1 text-sm'>
												<div className='flex items-center gap-2'>
													<span className='text-muted-foreground'>Rank</span>
													<span className='font-medium'>#{data.rank}</span>
												</div>
												<div className='flex items-center gap-2'>
													<span className='text-muted-foreground'>Rating</span>
													<span className='font-medium'>{data.eloRating}</span>
												</div>
											</div>
										</div>
									)
								}}
							/>
							<Area
								dataKey='eloRating'
								type='natural'
								fill='url(#fillEloRating)'
								stroke='var(--color-eloRating)'
								yAxisId='eloRating'
							/>
							<Area
								dataKey='ranking'
								type='natural'
								fill='url(#fillRanking)'
								stroke='var(--color-ranking)'
								yAxisId='ranking'
							/>
							<ChartLegend content={<ChartLegendContent />} />
						</AreaChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	)
}
