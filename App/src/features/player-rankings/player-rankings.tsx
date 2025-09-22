/**
 * Player Rankings page component
 *
 * Displays the player rankings in a sophisticated leaderboard format
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from 'react-firebase-hooks/firestore'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

import { currentPlayerRankingsQuery } from '@/firebase/collections/player-rankings'
import { PlayerRankingDocument } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {
	Trophy,
	TrendingUp,
	TrendingDown,
	Medal,
	Crown,
	Award,
	Info,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface PlayerRankingsProps {
	showAdminControls?: boolean
}

export const PlayerRankings: React.FC<PlayerRankingsProps> = ({
	showAdminControls = false,
}) => {
	const navigate = useNavigate()
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [rankingsSnapshot, loading, error] = useCollection(
		currentPlayerRankingsQuery()
	)

	const rankings = rankingsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (PlayerRankingDocument & { id: string })[] | undefined

	// Helper function to process rankings with proper tie handling
	const processRankingsWithTies = (
		rankings: (PlayerRankingDocument & { id: string })[]
	) => {
		const tiedGroups = new Map<number, string[]>()
		const tiedPlayerIds = new Set<string>()
		const trueRankMap = new Map<string, number>()
		const medalEligibilityMap = new Map<string, boolean>()

		// Group players by their rounded ELO rating
		rankings.forEach((player) => {
			const roundedRating = Math.round(player.eloRating * 1000000) / 1000000

			if (!tiedGroups.has(roundedRating)) {
				tiedGroups.set(roundedRating, [])
			}
			tiedGroups.get(roundedRating)!.push(player.id)
		})

		// Identify tied players and calculate true ranks
		let currentTrueRank = 1
		const sortedRatings = Array.from(tiedGroups.keys()).sort((a, b) => b - a) // Highest first

		sortedRatings.forEach((rating) => {
			const playerIds = tiedGroups.get(rating)!

			if (playerIds.length > 1) {
				// These players are tied
				playerIds.forEach((id) => {
					tiedPlayerIds.add(id)
					trueRankMap.set(id, currentTrueRank)
					// Medal eligibility if any position in the tie group is <= 3
					medalEligibilityMap.set(id, currentTrueRank <= 3)
				})
			} else {
				// Single player at this rating
				const playerId = playerIds[0]
				trueRankMap.set(playerId, currentTrueRank)
				medalEligibilityMap.set(playerId, currentTrueRank <= 3)
			}

			// Advance rank by the number of players at this rating level
			currentTrueRank += playerIds.length
		})

		return {
			tiedPlayerIds,
			trueRankMap,
			medalEligibilityMap,
		}
	}

	const { trueRankMap, medalEligibilityMap } = rankings
		? processRankingsWithTies(rankings)
		: {
				trueRankMap: new Map<string, number>(),
				medalEligibilityMap: new Map<string, boolean>(),
			}

	const handlePlayerClick = (playerId: string) => {
		navigate(`/player-rankings/player/${playerId}`)
	}

	if (error) {
		return (
			<div className='container mx-auto px-4 py-8 space-y-6'>
				{/* Header */}
				<div className='text-center space-y-4'>
					<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
						<Medal className='h-8 w-8' />
						Player Rankings
					</h1>
					<p className='text-muted-foreground'>
						Player rankings based on performance and ELO rating system
					</p>
				</div>
				<Card>
					<CardContent className='p-6'>
						<p className='text-red-600'>
							Error loading Player Rankings: {error.message}
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
					<Medal className='h-8 w-8' />
					Player Rankings
				</h1>
				<p className='text-muted-foreground'>
					Player rankings based on performance and ELO rating system
				</p>
			</div>

			{/* Informational Alert */}
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogTrigger asChild>
					<Alert className='cursor-pointer hover:bg-muted/50 transition-colors mb-6'>
						<Info className='h-4 w-4' />
						<AlertTitle>Player Ranking Algorithm</AlertTitle>
						<AlertDescription>
							Rankings are calculated using an advanced ELO-based algorithm.
							Click to learn more about how players are ranked.
						</AlertDescription>
					</Alert>
				</DialogTrigger>
				<DialogContent className='max-w-4xl'>
					<VisuallyHidden>
						<DialogHeader>
							<DialogTitle className='flex items-center gap-2'>
								Player Ranking Algorithm
							</DialogTitle>
							<DialogDescription>
								Understanding how the Player Rankings are calculated
							</DialogDescription>
						</DialogHeader>
					</VisuallyHidden>
					<div className='space-y-6 text-sm max-h-[70vh] overflow-y-auto pr-2'>
						{/* Core Formula */}
						<div>
							<h4 className='font-semibold mb-3 text-base'>
								Core ELO Rating Formula
							</h4>
							<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
								<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^s \times f_p \times (S_{\text{actual}} - E)' />
							</div>
							<p className='text-muted-foreground'>
								Each player starts with 1200 ELO rating. The formula combines
								traditional ELO mathematics with sophisticated point
								differential analysis, temporal weighting, and round-based
								decay.
							</p>
						</div>

						{/* Point Differential System */}
						<div>
							<h4 className='font-semibold mb-2'>
								Point Differential Weighting
							</h4>
							<p className='text-muted-foreground mb-2'>
								Unlike traditional win/loss ELO, our algorithm considers{' '}
								<em>how much</em> you won or lost by using weighted
								differentials:
							</p>
							<div className='bg-muted/20 p-2 rounded text-center mb-2'>
								<InlineMath math='d_{\text{weighted}} = \begin{cases} d & \text{if } |d| \leq 5 \\ \text{sign}(d) \times [5 + 2.2 \times \ln(|d| - 4)] & \text{if } |d| > 5 \end{cases}' />
							</div>
							<div className='bg-muted/20 p-2 rounded text-center mb-2'>
								<InlineMath math='S_{\text{actual}} = \text{clamp}(0.5 + \frac{d_{\text{weighted}}}{80}, 0, 1)' />
							</div>
							<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
								<li>• Win by 4 points = 0.55 actual score</li>
								<li>• Loss by 6 points = 0.41 actual score</li>
								<li>
									• Large differentials use logarithmic scaling to prevent
									outliers
								</li>
								<li>• Optimized for ~20 point Ultimate Frisbee games</li>
							</ul>
						</div>

						{/* Team Strength Analysis */}
						<div>
							<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
							<p className='text-muted-foreground mb-2'>
								Team strength is calculated as the average rating of all roster
								players, adjusted for historical seasons:
							</p>
							<div className='bg-muted/20 p-2 rounded text-center mb-2'>
								<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} [1200 + (R_i - 1200) \times 0.82^s]' />
							</div>
							<p className='text-xs text-muted-foreground text-center mb-2'>
								where <InlineMath math='s' /> = seasons back in time,{' '}
								<InlineMath math='n' /> = roster size
							</p>
							<div className='bg-muted/20 p-2 rounded text-center'>
								<InlineMath math='E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}' />
							</div>
							<p className='text-xs text-muted-foreground text-center mt-1'>
								Expected score uses standard ELO formula
							</p>
						</div>

						{/* Round-Based Inactivity Decay */}
						<div>
							<h4 className='font-semibold mb-2'>
								Round-Based Inactivity Decay
							</h4>
							<p className='text-muted-foreground mb-2'>
								Player ratings decay gradually each round they don't
								participate:
							</p>
							<div className='bg-muted/20 p-2 rounded text-center mb-2'>
								<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times 0.996^r' />
							</div>
							<p className='text-xs text-muted-foreground text-center mb-2'>
								where <InlineMath math='r' /> = rounds of inactivity
							</p>
							<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
								<li>• Decay applies per round, not per season</li>
								<li>• ~0.4% rating loss per round above base (1200)</li>
								<li>• Over 20 rounds: equivalent to ~5% seasonal decay</li>
								<li>• Gradual adjustment ensures realistic rating evolution</li>
							</ul>
						</div>

						{/* Temporal Factors */}
						<div>
							<h4 className='font-semibold mb-2'>Temporal Weighting System</h4>
							<div className='grid grid-cols-2 gap-3 mb-2'>
								<div>
									<p className='text-xs font-medium mb-1'>
										Season Decay (α = 0.82)
									</p>
									<ul className='text-xs text-muted-foreground space-y-0.5'>
										<li>Current season: 100% weight</li>
										<li>Previous season: 82% weight</li>
										<li>2 seasons ago: 67% weight</li>
									</ul>
								</div>
								<div>
									<p className='text-xs font-medium mb-1'>
										Game Type Multipliers
									</p>
									<ul className='text-xs text-muted-foreground space-y-0.5'>
										<li>Regular season: 1.0×</li>
										<li>Playoff games: 1.8×</li>
										<li>K-factor = 36 × modifiers</li>
									</ul>
								</div>
							</div>
						</div>

						{/* Advanced Features */}
						<div>
							<h4 className='font-semibold mb-2'>Advanced Features</h4>
							<div className='space-y-2'>
								<div>
									<p className='text-xs font-medium'>
										Confidence-Based Team Calculation
									</p>
									<p className='text-xs text-muted-foreground mb-2'>
										Team confidence based on known player ratings:
									</p>
									<div className='text-center text-xs'>
										<InlineMath math='\text{confidence} = \frac{\text{rated players}}{\text{total roster}} \geq 0.5' />
									</div>
									<p className='text-xs text-muted-foreground text-center mt-1'>
										Low confidence teams use default strength (1200)
									</p>
								</div>
								<div>
									<p className='text-xs font-medium'>
										Chronological Processing
									</p>
									<p className='text-xs text-muted-foreground'>
										All games processed by rounds in chronological order to
										ensure team strengths reflect accurate historical ratings at
										game time
									</p>
								</div>
								<div>
									<p className='text-xs font-medium'>
										Round-Based Incremental Updates
									</p>
									<p className='text-xs text-muted-foreground'>
										System identifies uncalculated rounds for efficient
										incremental updates while preserving existing player
										statistics
									</p>
								</div>
							</div>
						</div>

						{/* Algorithm Constants */}
						<div>
							<h4 className='font-semibold mb-3'>Key Algorithm Constants</h4>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										STARTING RATING
									</span>
									<span className='text-lg font-mono font-bold mb-1'>1200</span>
									<p className='text-xs text-muted-foreground'>
										Initial ELO rating for new players
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										K-FACTOR
									</span>
									<span className='text-lg font-mono font-bold mb-1'>36</span>
									<p className='text-xs text-muted-foreground'>
										Maximum rating change per game
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										SEASON DECAY
									</span>
									<span className='text-lg font-mono font-bold mb-1'>0.82</span>
									<p className='text-xs text-muted-foreground'>
										Weight reduction per past season
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										PLAYOFF MULTIPLIER
									</span>
									<span className='text-lg font-mono font-bold mb-1'>1.8</span>
									<p className='text-xs text-muted-foreground'>
										Postseason game importance factor
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										ROUND DECAY
									</span>
									<span className='text-lg font-mono font-bold mb-1'>
										0.996
									</span>
									<p className='text-xs text-muted-foreground'>
										Rating decay per inactive round
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										MAX DIFFERENTIAL
									</span>
									<span className='text-lg font-mono font-bold mb-1'>5</span>
									<p className='text-xs text-muted-foreground'>
										Full weight point differential threshold
									</p>
								</div>
							</div>
						</div>

						{/* Calculation Notes */}
						<div className='border-t pt-4'>
							<h4 className='font-semibold mb-2 text-xs'>Technical Notes</h4>
							<ul className='text-xs text-muted-foreground space-y-1'>
								<li>
									• All calculations performed in chronological order by rounds
								</li>
								<li>
									• Team strengths calculated at game time using historical
									ratings
								</li>
								<li>
									• Point differentials normalized for ~20-point Ultimate
									Frisbee games
								</li>
								<li>
									• Incremental updates process only new uncalculated rounds
								</li>
								<li>
									• Full rebuilds process all historical data from scratch
								</li>
								<li>
									• Round-based decay applies continuously during periods
									without play
								</li>
								<li>
									• Logarithmic scaling prevents large point differential
									outliers
								</li>
								<li>
									• Confidence thresholds ensure reliable team strength
									calculations
								</li>
							</ul>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Rankings Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Medal className='h-5 w-5' />
						Player Rankings
					</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-16'>Rank</TableHead>
										<TableHead className='w-32'>Player</TableHead>
										<TableHead className='w-32 text-center'>Rating</TableHead>
										<TableHead className='w-32 text-center'>Change</TableHead>
										<TableHead className='w-32 text-center'>Games</TableHead>
										<TableHead className='w-32 text-center'>Seasons</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...Array(8)].map((_, i) => (
										<TableRow key={i}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<Skeleton className='h-4 w-4 opacity-20' />
													<Skeleton className='h-4 w-6 opacity-20' />
												</div>
											</TableCell>
											<TableCell>
												<div className='space-y-1'>
													<Skeleton className='h-4 w-32 opacity-20' />
												</div>
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-20 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-12 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-8 mx-auto opacity-20' />
											</TableCell>
											<TableCell className='text-center'>
												<Skeleton className='h-4 w-6 mx-auto opacity-20' />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : rankings && rankings.length > 0 ? (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-16'>Rank</TableHead>
										<TableHead className='w-32'>Player</TableHead>
										<TableHead className='w-32 text-center'>Rating</TableHead>
										<TableHead className='w-32 text-center'>Change</TableHead>
										<TableHead className='w-32 text-center'>Games</TableHead>
										<TableHead className='w-32 text-center'>Seasons</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rankings.map((player) => {
										const trueRank = trueRankMap.get(player.id) || player.rank
										const isMedalEligible =
											medalEligibilityMap.get(player.id) || false

										return (
											<TableRow
												key={player.id}
												onClick={() => handlePlayerClick(player.id)}
												className={cn(
													'hover:bg-muted/50 cursor-pointer transition-colors',
													isMedalEligible &&
														'bg-gradient-to-r from-yellow-50 to-transparent dark:from-yellow-900/20'
												)}
											>
												<TableCell className='font-medium'>
													<div className='flex items-center gap-2'>
														{trueRank === 1 && (
															<Crown className='h-4 w-4 text-yellow-500' />
														)}
														{trueRank === 2 && (
															<Award className='h-4 w-4 text-gray-400' />
														)}
														{trueRank === 3 && (
															<Medal className='h-4 w-4 text-amber-600' />
														)}
														<div className='flex items-center gap-1'>
															#{trueRank}
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className='space-y-1'>
														<div
															className={cn(
																'font-medium',
																player.rank <= 3 && 'dark:text-foreground'
															)}
														>
															{player.playerName}
														</div>
													</div>
												</TableCell>
												<TableCell className='text-center'>
													{player.eloRating.toFixed(6)}
												</TableCell>
												<TableCell className='text-center'>
													{player.lastRatingChange !== 0 && (
														<div
															className={cn(
																'flex items-center justify-center gap-1',
																player.lastRatingChange > 0
																	? 'text-green-600'
																	: 'text-red-600'
															)}
														>
															{player.lastRatingChange > 0 ? (
																<TrendingUp className='h-3 w-3' />
															) : (
																<TrendingDown className='h-3 w-3' />
															)}
															{Math.abs(player.lastRatingChange)}
														</div>
													)}
												</TableCell>
												<TableCell className='text-center'>
													{player.totalGames}
												</TableCell>
												<TableCell className='text-center'>
													{player.totalSeasons}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className='text-center py-8'>
							<Trophy className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
							<p className='text-muted-foreground'>
								No player rankings available yet.
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Rankings will appear after the first calculation is completed.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Admin Controls */}
			{showAdminControls && (
				<Card>
					<CardHeader>
						<CardTitle>Admin Controls</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='flex gap-4'>
							<Button variant='outline'>Recalculate Rankings (Full)</Button>
							<Button variant='outline'>Update Rankings (Incremental)</Button>
							<Button variant='outline'>View Calculation History</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
