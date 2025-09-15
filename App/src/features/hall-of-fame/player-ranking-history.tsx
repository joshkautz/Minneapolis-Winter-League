/**
 * PlayerRankingHistory component
 *
 * Displays a player's ranking history throughout their career using interactive charts
 * Accessible at /hall-of-fame/player/{playerId}
 */

import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { doc, DocumentReference, collection, Query } from 'firebase/firestore'

import { firestore } from '@/firebase/app'
import {
	PlayerDocument,
	Collections,
	SeasonDocument,
	RankingHistoryDocument,
} from '@/types'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Trophy, User, ArrowLeft } from 'lucide-react'

interface PlayerRankingHistoryProps {
	/** Optional class name for styling */
	className?: string
}

interface ChartDataPoint {
	/** Date in YYYY-MM-DD format for display */
	date: string
	/** Player's rank position (inverted for display) */
	ranking: number
	/** Player's Elo rating */
	eloRating: number
	/** Week identifier (e.g., "W3") for display */
	week: string
	/** Player's actual rank position */
	rank: number
	/** Weekly change in rating */
	change: number
	/** Season identifier */
	season: string
	/** Unix timestamp for sorting */
	timestamp: number
	/** Games played that week */
	gamesPlayed: number
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
						Player ID is required to view ranking history.
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	// Fetch all players for the dropdown
	const [allPlayersSnapshot, allPlayersLoading] = useCollection(
		collection(firestore, Collections.PLAYERS) as Query<PlayerDocument>
	)

	// Fetch player data to get the player name
	const [playerSnapshot, playerLoading] = useDocument(
		doc(
			firestore,
			Collections.PLAYERS,
			playerId
		) as DocumentReference<PlayerDocument>
	)

	// Fetch all ranking history data from ranking-history collection
	const [rankingHistorySnapshot, historyLoading, error] = useCollection(
		collection(firestore, 'ranking-history') as Query<RankingHistoryDocument>
	)

	// Fetch all seasons data to get season start dates
	const [seasonsSnapshot, seasonsLoading] = useCollection(
		collection(firestore, Collections.SEASONS) as Query<SeasonDocument>
	)

	const loading =
		playerLoading || historyLoading || allPlayersLoading || seasonsLoading
	const playerName =
		playerSnapshot?.data()?.firstname && playerSnapshot?.data()?.lastname
			? `${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`
			: 'Unknown Player'

	// Create seasons lookup map
	const seasonsMap = useMemo(() => {
		if (!seasonsSnapshot?.docs)
			return new Map<
				string,
				SeasonDocument & { id: string; dateStart: Date | null }
			>()

		const map = new Map<
			string,
			SeasonDocument & { id: string; dateStart: Date | null }
		>()
		seasonsSnapshot.docs.forEach((doc) => {
			const seasonData = doc.data() as SeasonDocument

			// Try to convert Firestore Timestamp to JavaScript Date
			let startDate = null
			if (seasonData.dateStart) {
				if (typeof seasonData.dateStart.toDate === 'function') {
					// Firestore Timestamp object
					startDate = seasonData.dateStart.toDate()
				} else if (seasonData.dateStart instanceof Date) {
					// Already a Date object
					startDate = seasonData.dateStart
				} else if (seasonData.dateStart.seconds) {
					// Raw Firestore timestamp with seconds/nanoseconds
					startDate = new Date(
						seasonData.dateStart.seconds * 1000 +
							seasonData.dateStart.nanoseconds / 1000000
					)
				}
			}

			// Fallback: try startDate field name
			if (!startDate && seasonData.startDate) {
				if (typeof seasonData.startDate.toDate === 'function') {
					startDate = seasonData.startDate.toDate()
				} else if (seasonData.startDate instanceof Date) {
					startDate = seasonData.startDate
				} else if (seasonData.startDate.seconds) {
					startDate = new Date(
						seasonData.startDate.seconds * 1000 +
							seasonData.startDate.nanoseconds / 1000000
					)
				}
			}

			map.set(doc.id, {
				...seasonData,
				id: doc.id,
				dateStart: startDate,
			})
		})
		return map
	}, [seasonsSnapshot])

	// Get all players for dropdown - only include players with ranking history data
	const allPlayers = useMemo(() => {
		if (!allPlayersSnapshot?.docs || !rankingHistorySnapshot?.docs) return []

		// Get unique player IDs from ranking history data
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

		// Filter players to only include those with ranking history
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
		navigate(`/hall-of-fame/player/${newPlayerId}`)
	}

	// Process data to extract player's history
	const chartData = useMemo(() => {
		if (!rankingHistorySnapshot?.docs) return []

		const playerHistory: ChartDataPoint[] = []

		rankingHistorySnapshot.docs.forEach((doc) => {
			const docId = doc.id // Format: {SeasonID}_week_{weekNumber}
			const data = doc.data()

			// Parse document ID to extract season and week info
			const idParts = docId.split('_week_')
			if (idParts.length !== 2) {
				console.warn(`Skipping malformed document ID: ${docId}`)
				return
			}

			const seasonId = idParts[0]
			const weekNumber = parseInt(idParts[1])

			if (isNaN(weekNumber)) {
				console.warn(`Invalid week number in document ID: ${docId}`)
				return
			}

			// Find player in the rankings array
			const rankings = data.rankings || []
			if (!Array.isArray(rankings)) {
				console.warn(`Rankings is not an array in document: ${docId}`)
				return
			}

			const playerIndex = rankings.findIndex(
				(player: any) => player.playerId === playerId
			)

			if (playerIndex !== -1) {
				const playerData = rankings[playerIndex]
				const playerRank = playerData.rank // Use the rank field from the ranking object

				// Validate that we have a valid rank
				if (
					typeof playerRank !== 'number' ||
					isNaN(playerRank) ||
					playerRank <= 0
				) {
					console.warn(
						`Invalid or missing rank for player ${playerId} in ${docId}:`,
						playerRank,
						'typeof:',
						typeof playerRank,
						'playerData:',
						playerData
					)
					return
				}

				// Get season information from seasons collection
				const seasonInfo = seasonsMap.get(seasonId)
				let seasonStartDate: Date

				if (
					seasonInfo &&
					seasonInfo.dateStart &&
					seasonInfo.dateStart instanceof Date
				) {
					seasonStartDate = seasonInfo.dateStart
				} else {
					// Fallback: assume season starts January 1st of current year
					console.warn(
						`No valid season start date found for ${seasonId}, using fallback. Season info:`,
						seasonInfo
					)
					seasonStartDate = new Date(new Date().getFullYear(), 0, 1)
				}

				// Validate that we have a proper Date object
				if (
					!(seasonStartDate instanceof Date) ||
					isNaN(seasonStartDate.getTime())
				) {
					console.warn(
						`Invalid season start date for ${seasonId}, using fallback`
					)
					seasonStartDate = new Date(new Date().getFullYear(), 0, 1)
				}

				// Validate week number and calculate week date
				if (weekNumber < 1 || weekNumber > 52) {
					console.warn(`Invalid week number ${weekNumber} in document ${docId}`)
					return
				}

				// Calculate the actual week date from season start
				const weekDate = new Date(
					seasonStartDate.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000
				)

				// Validate the calculated date
				if (isNaN(weekDate.getTime())) {
					console.warn(`Invalid date calculated for ${docId}`)
					return
				}

				const dateString = weekDate.toISOString().split('T')[0] // YYYY-MM-DD format

				playerHistory.push({
					date: dateString,
					week: `Week ${weekNumber}`,
					rank: playerRank,
					ranking: playerRank, // Use actual rank (lower is better)
					eloRating: parseFloat((playerData.eloRating || 0).toFixed(5)),
					change: 0, // We don't have weekly change data in this structure
					season: seasonId,
					timestamp: weekDate.getTime(),
					gamesPlayed: 0, // We don't have games played data in this structure
				})
			}
		})

		// Sort by timestamp to ensure proper chronological order
		return playerHistory.sort((a, b) => a.timestamp - b.timestamp)
	}, [rankingHistorySnapshot, playerId, seasonsMap])

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
			<Card className={className}>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Trophy className='h-5 w-5' />
						Ranking History
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert variant='destructive'>
						<AlertDescription>
							Failed to load ranking history. Please try again later.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		)
	}

	if (chartData.length === 0) {
		return (
			<Card className={className}>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Trophy className='h-5 w-5' />
						Ranking History
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert>
						<AlertDescription>
							No ranking history data available for this player.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className='container max-w-6xl mx-auto py-8 space-y-6'>
			{/* Back button */}
			<div className='flex items-center gap-4'>
				<Button
					variant='outline'
					size='sm'
					onClick={() => navigate('/hall-of-fame')}
					className='flex items-center gap-2'
				>
					<ArrowLeft className='h-4 w-4' />
					Back to Hall of Fame
				</Button>
			</div>

			<Card className={`${className} pt-0`}>
				<CardHeader className='flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row'>
					<div className='grid flex-1 gap-1'>
						<CardTitle className='flex items-center gap-2'>
							<Trophy className='h-5 w-5' />
							Ranking History
						</CardTitle>
					</div>
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

									// Get season name from seasonsMap
									const seasonInfo = seasonsMap.get(data.season)
									const seasonName = seasonInfo?.name || data.season

									return (
										<div className='rounded-lg border bg-background p-3 shadow-md'>
											<div className='mb-2'>
												<p className='text-sm font-medium'>
													{seasonName} • {data.week}
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
