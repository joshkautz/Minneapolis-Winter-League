/**
 * PlayerRankingHistory component
 *
 * Displays a player's rankings history throughout their career using interactive charts
 * Accessible at /players/{playerId}
 */

import { useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { collection, Query } from 'firebase/firestore'

import { firestore } from '@/firebase/app'
import { logger, hasAssignedTeams } from '@/shared/utils'
import { PlayerDocument, Collections, RankingHistoryDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Trophy, ArrowLeft, Users, Shield } from 'lucide-react'
import {
	useSeasonsContext,
	useTeamsContext,
	useGamesContext,
} from '@/providers'

interface PlayerRankingHistoryProps {
	/** Optional class name for styling */
	className?: string
}

interface ChartDataPoint {
	/** Date in ISO timestamp format for display */
	date: string
	/** Player's rank position (inverted for display) */
	ranking: number
	/** Player's skill rating (TrueSkill μ) */
	rating: number
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
	rating: {
		label: 'Skill Rating',
		color: 'var(--chart-2)',
	},
} satisfies ChartConfig

// Interface for processed team history entry
interface TeamHistoryEntry {
	seasonId: string
	seasonName: string
	teamId: string | null
	teamName: string | null
	teamLogo: string | null
	wins: number
	losses: number
	placement: number | null
	isCaptain: boolean
}

// Format placement with ordinal suffix and medal emoji for top 3
const formatPlacement = (placement: number | null) => {
	if (placement === null) return 'TBD'
	if (placement === 1) return '1st 🥇'
	if (placement === 2) return '2nd 🥈'
	if (placement === 3) return '3rd 🥉'
	const suffix =
		placement % 10 === 1 && placement !== 11
			? 'st'
			: placement % 10 === 2 && placement !== 12
				? 'nd'
				: placement % 10 === 3 && placement !== 13
					? 'rd'
					: 'th'
	return `${placement}${suffix}`
}

export const PlayerRankingHistory = ({
	className,
}: PlayerRankingHistoryProps) => {
	const { playerId } = useParams<{ playerId: string }>()
	const navigate = useNavigate()

	// Get seasons, teams, and games data from contexts
	const { seasonsQuerySnapshot } = useSeasonsContext()
	const { allTeamsQuerySnapshot } = useTeamsContext()
	const { allGamesQuerySnapshot: allGamesSnapshot } = useGamesContext()

	// Fetch all players for the dropdown
	const [allPlayersSnapshot, allPlayersLoading, allPlayersError] =
		useCollection(
			collection(firestore, Collections.PLAYERS) as Query<PlayerDocument>
		)

	// Fetch all rankings history data from rankings-history collection
	const [rankingHistorySnapshot, historyLoading, error] = useCollection(
		collection(
			firestore,
			Collections.RANKINGS_HISTORY
		) as Query<RankingHistoryDocument>
	)

	// Log and notify on query errors
	useEffect(() => {
		if (allPlayersError) {
			logger.error('Failed to load players:', {
				component: 'PlayerRankingHistory',
				error: allPlayersError.message,
			})
			toast.error('Failed to load players', {
				description: allPlayersError.message,
			})
		}
	}, [allPlayersError])

	useEffect(() => {
		if (error) {
			logger.error('Failed to load ranking history:', {
				component: 'PlayerRankingHistory',
				playerId,
				error: error.message,
			})
			toast.error('Failed to load ranking history', {
				description: error.message,
			})
		}
	}, [error, playerId])

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
				rankings.forEach((player: { playerId?: string }) => {
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
				(player: { playerId?: string; rank?: number; rating?: number }) =>
					player.playerId === playerId
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
				rating: parseFloat((playerData.rating || 0).toFixed(5)),
				season: seasonId,
				timestamp: roundDate.getTime(),
			})
		})

		// Sort by timestamp to ensure proper chronological order
		return playerHistory.sort((a, b) => a.timestamp - b.timestamp)
	}, [rankingHistorySnapshot, playerId])

	// Calculate team records from games
	const teamRecords = useMemo(() => {
		const records: Record<string, { wins: number; losses: number }> = {}

		if (!allGamesSnapshot?.docs) return records

		allGamesSnapshot.docs.forEach((gameDoc) => {
			const gameData = gameDoc.data()

			// Skip games with null team references (placeholder games)
			if (!hasAssignedTeams(gameData)) return

			const { home, away, homeScore, awayScore } = gameData

			// Skip games that haven't been played yet (null scores)
			if (homeScore === null || awayScore === null) return

			// Update home team record
			if (!records[home.id]) {
				records[home.id] = { wins: 0, losses: 0 }
			}
			if (homeScore > awayScore) {
				records[home.id].wins++
			} else if (homeScore < awayScore) {
				records[home.id].losses++
			}

			// Update away team record
			if (!records[away.id]) {
				records[away.id] = { wins: 0, losses: 0 }
			}
			if (awayScore > homeScore) {
				records[away.id].wins++
			} else if (awayScore < homeScore) {
				records[away.id].losses++
			}
		})

		return records
	}, [allGamesSnapshot])

	// Process player's team history from their seasons array
	const teamHistory = useMemo((): TeamHistoryEntry[] => {
		if (!allPlayersSnapshot?.docs || !playerId) return []

		// Find the current player's document
		const playerDoc = allPlayersSnapshot.docs.find((doc) => doc.id === playerId)
		if (!playerDoc) return []

		const playerData = playerDoc.data()
		const seasons = playerData.seasons || []

		if (!Array.isArray(seasons) || seasons.length === 0) return []

		// Create a map of season timestamps for sorting
		const seasonTimestamps = new Map<string, number>()
		seasonsQuerySnapshot?.docs.forEach((doc) => {
			const data = doc.data()
			if (data.dateStart) {
				// Handle Firestore Timestamp or Date object
				const timestamp =
					typeof data.dateStart.toDate === 'function'
						? data.dateStart.toDate().getTime()
						: data.dateStart instanceof Date
							? data.dateStart.getTime()
							: data.dateStart.seconds
								? data.dateStart.seconds * 1000
								: 0
				seasonTimestamps.set(doc.id, timestamp)
			}
		})

		// Process each season entry
		const history: (TeamHistoryEntry & { sortTimestamp: number })[] = seasons
			.map((seasonEntry) => {
				// Get season name from context
				const seasonRef = seasonEntry.season
				const seasonDoc = seasonsQuerySnapshot?.docs.find(
					(doc) => doc.ref.path === seasonRef?.path
				)
				const seasonName = seasonDoc?.data()?.name || 'Unknown Season'
				const seasonId = seasonDoc?.id || ''

				// Get team data from context
				const teamRef = seasonEntry.team
				let teamId: string | null = null
				let teamName: string | null = null
				let teamLogo: string | null = null
				let placement: number | null = null

				if (teamRef) {
					const teamDoc = allTeamsQuerySnapshot?.docs.find(
						(doc) => doc.ref.path === teamRef.path
					)
					teamId = teamDoc?.id || null
					teamName = teamDoc?.data()?.name || 'Unknown Team'
					teamLogo = teamDoc?.data()?.logo || null
					placement = teamDoc?.data()?.placement ?? null
				}

				// Get team record
				const record = teamId ? teamRecords[teamId] : null

				return {
					seasonId,
					seasonName,
					teamId,
					teamName,
					teamLogo,
					wins: record?.wins || 0,
					losses: record?.losses || 0,
					placement,
					isCaptain: seasonEntry.captain || false,
					sortTimestamp: seasonTimestamps.get(seasonId) || 0,
				}
			})
			// Filter out entries without a team (free agents)
			.filter((entry) => entry.teamId !== null)

		// Sort by season dateStart timestamp (most recent first)
		return history
			.sort((a, b) => b.sortTimestamp - a.sortTimestamp)
			.map(({ sortTimestamp, ...entry }) => entry) // Remove the sortTimestamp from final output
	}, [
		allPlayersSnapshot,
		playerId,
		seasonsQuerySnapshot,
		allTeamsQuerySnapshot,
		teamRecords,
	])

	// Handle player selection change
	const handlePlayerChange = (newPlayerId: string) => {
		navigate(`/players/${newPlayerId}`)
	}

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
									{Array.from({ length: 8 }).map((_, i) => {
										// Generate height once per render using a deterministic value
										const height = ((i * 7 + 13) % 60) + 20
										return (
											<div
												key={i}
												className='flex flex-col items-center space-y-1'
											>
												<div
													className='w-2 bg-gray-300 animate-pulse relative overflow-hidden'
													style={{ height: `${height}%` }}
												>
													<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer' />
												</div>
											</div>
										)
									})}
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
						onClick={() => navigate('/players')}
						className='flex items-center gap-2'
					>
						<ArrowLeft className='h-4 w-4' />
						Back to Players
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
						onClick={() => navigate('/players')}
						className='flex items-center gap-2'
					>
						<ArrowLeft className='h-4 w-4' />
						Back to Players
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
						<Alert role='status' aria-live='polite'>
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
					onClick={() => navigate('/players')}
					className='flex items-center gap-2'
				>
					<ArrowLeft className='h-4 w-4' />
					Back to Players
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
						role='img'
						aria-label={`Player ranking history chart showing ${allPlayers.find((p) => p.id === playerId)?.name ?? 'Unknown Player'}'s ranking and rating progression over time. Current rank: ${chartData.length > 0 ? chartData[chartData.length - 1]?.ranking : 'N/A'}, Current rating: ${chartData.length > 0 ? chartData[chartData.length - 1]?.rating?.toFixed(2) : 'N/A'}`}
					>
						<AreaChart data={chartData} aria-hidden='true'>
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
								<linearGradient id='fillRating' x1='0' y1='0' x2='0' y2='1'>
									<stop
										offset='5%'
										stopColor='var(--color-rating)'
										stopOpacity={0.8}
									/>
									<stop
										offset='95%'
										stopColor='var(--color-rating)'
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
								yAxisId='rating'
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
													<span className='font-medium'>{data.rating}</span>
												</div>
											</div>
										</div>
									)
								}}
							/>
							<Area
								dataKey='rating'
								type='natural'
								fill='url(#fillRating)'
								stroke='var(--color-rating)'
								yAxisId='rating'
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

			{/* Team History Card */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<Users className='h-5 w-5' />
						Team History
					</CardTitle>
				</CardHeader>
				<CardContent className='p-0'>
					{teamHistory.length > 0 ? (
						<ul aria-label='Team history' className='list-none m-0 p-0'>
							{teamHistory.map((entry, index) => (
								<li key={`${entry.seasonId}-${entry.teamId}-${index}`}>
									<Link
										to={entry.teamId ? `/teams/${entry.teamId}` : '#'}
										className='flex items-center gap-4 px-6 py-3 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
										aria-label={`${entry.teamName}, ${entry.seasonName}, ${entry.wins} wins ${entry.losses} losses, finished ${formatPlacement(entry.placement)}${entry.isCaptain ? ', Team Captain' : ''}`}
									>
										{/* Team Logo */}
										<div className='flex-shrink-0'>
											{entry.teamLogo ? (
												<img
													src={entry.teamLogo}
													alt=''
													className='w-10 h-10 rounded-full object-cover bg-muted'
												/>
											) : (
												<div className='w-10 h-10 rounded-full bg-gradient-to-br from-primary to-sky-300 flex items-center justify-center'>
													<span className='text-sm font-bold text-primary-foreground'>
														{entry.teamName?.charAt(0)?.toUpperCase() || 'T'}
													</span>
												</div>
											)}
										</div>

										{/* Team Info */}
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2'>
												<span className='font-medium text-foreground truncate'>
													{entry.teamName}
												</span>
												{entry.isCaptain && (
													<Badge
														variant='secondary'
														className='flex items-center gap-1 shrink-0'
													>
														<Shield className='h-3 w-3' />
														<span className='sr-only sm:not-sr-only'>
															Captain
														</span>
													</Badge>
												)}
											</div>
											<span className='text-sm text-muted-foreground'>
												{entry.seasonName}
											</span>
										</div>

										{/* Win-Loss Record */}
										<div className='flex-shrink-0 text-center'>
											<div className='text-sm font-medium'>
												{entry.wins}-{entry.losses}
											</div>
											<div className='text-xs text-muted-foreground'>
												Record
											</div>
										</div>

										{/* Placement */}
										<div className='flex-shrink-0 text-right min-w-[60px]'>
											<div className='text-sm font-medium'>
												{formatPlacement(entry.placement)}
											</div>
											<div className='text-xs text-muted-foreground'>
												Finish
											</div>
										</div>
									</Link>
								</li>
							))}
						</ul>
					) : (
						<p className='text-sm text-muted-foreground text-center py-6 px-6'>
							No team history available for this player.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
