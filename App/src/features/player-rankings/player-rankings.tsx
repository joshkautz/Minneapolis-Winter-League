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
import { Badge } from '@/components/ui/badge'
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
								Core Rating Formula
							</h4>
							<div className='bg-muted/30 p-3 rounded-lg border text-center mb-3'>
								<BlockMath math='R_{\text{new}} = R_{\text{old}} + K \times \alpha^n \times f_p \times (S_{\text{actual}} - E)' />
							</div>
							<p className='text-muted-foreground'>
								Each player starts with 1200 ELO rating. The formula combines
								traditional ELO mathematics with sophisticated point
								differential analysis and temporal weighting.
							</p>
						</div>

						{/* Point Differential System */}
						<div>
							<h4 className='font-semibold mb-2'>
								Point Differential Weighting
							</h4>
							<p className='text-muted-foreground mb-2'>
								Unlike traditional win/loss ELO, our algorithm considers{' '}
								<em>how much</em> you won or lost by:
							</p>
							<div className='bg-muted/20 p-2 rounded text-center'>
								<InlineMath math='S_{\text{actual}} = \text{clamp}(0.5 + \frac{d_{\text{weighted}}}{100}, 0, 1)' />
							</div>
							<ul className='text-muted-foreground space-y-1 text-xs ml-4'>
								<li>• Win by 10 points = 0.6 actual score</li>
								<li>• Loss by 15 points = 0.35 actual score</li>
								<li>
									• Large differentials use logarithmic scaling to prevent
									outliers
								</li>
							</ul>
						</div>

						{/* Team Strength Analysis */}
						<div>
							<h4 className='font-semibold mb-2'>Dynamic Team Strength</h4>
							<p className='text-muted-foreground mb-2'>
								Team strength is calculated as the average rating of all roster
								players, historically adjusted:
							</p>
							<div className='bg-muted/20 p-2 rounded text-center'>
								<InlineMath math='\bar{R}_{\text{team}} = \frac{1}{n} \times \sum[R_{\text{start}} + (R_i - R_{\text{start}}) \times \alpha^n]' />
							</div>
							<p className='text-xs text-muted-foreground text-center mt-2'>
								Expected score uses standard ELO:{' '}
								<InlineMath math='E = \frac{1}{1 + 10^{(R_{\text{opponent}} - R_{\text{team}})/400}}' />
							</p>
						</div>

						{/* Temporal Factors */}
						<div>
							<h4 className='font-semibold mb-2'>Temporal Weighting System</h4>
							<div className='grid grid-cols-2 gap-3 mb-2'>
								<div>
									<p className='text-xs font-medium mb-1'>
										Season Decay (α = 0.8)
									</p>
									<ul className='text-xs text-muted-foreground space-y-0.5'>
										<li>Current season: 100% weight</li>
										<li>Previous season: 80% weight</li>
										<li>2 seasons ago: 64% weight</li>
									</ul>
								</div>
								<div>
									<p className='text-xs font-medium mb-1'>
										Game Type Multipliers
									</p>
									<ul className='text-xs text-muted-foreground space-y-0.5'>
										<li>Regular season: 1.0×</li>
										<li>Playoff games: 2.0×</li>
										<li>K-factor = 32 × modifiers</li>
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
										Diminishing Returns Model
									</p>
									<p className='text-xs text-muted-foreground mb-2'>
										Large point differentials (&gt;10) use logarithmic scaling:
									</p>
									<div className='text-center text-xs'>
										<InlineMath math='d_{\text{weighted}} = \text{sign}(d) \times [10 + 2 \times \ln(|d| - 9)] \text{ for } |d| > 10' />
									</div>
								</div>
								<div>
									<p className='text-xs font-medium'>Inactivity Decay</p>
									<p className='text-xs text-muted-foreground mb-2'>
										Rating decay:
									</p>
									<div className='text-center text-xs'>
										<InlineMath math='R_{\text{new}} = 1200 + (R_{\text{old}} - 1200) \times 0.95^s' />
									</div>
									<p className='text-xs text-muted-foreground text-center mt-1'>
										where <InlineMath math='s' /> = seasons inactive
									</p>
								</div>
								<div>
									<p className='text-xs font-medium'>
										Chronological Processing
									</p>
									<p className='text-xs text-muted-foreground'>
										All games processed in time order to ensure team strengths
										reflect accurate historical ratings
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
									<span className='text-lg font-mono font-bold mb-1'>32</span>
									<p className='text-xs text-muted-foreground'>
										Maximum rating change per game
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										SEASON DECAY
									</span>
									<span className='text-lg font-mono font-bold mb-1'>0.8</span>
									<p className='text-xs text-muted-foreground'>
										Weight reduction per past season
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										PLAYOFF MULTIPLIER
									</span>
									<span className='text-lg font-mono font-bold mb-1'>2.0</span>
									<p className='text-xs text-muted-foreground'>
										Postseason game importance factor
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										INACTIVITY DECAY
									</span>
									<span className='text-lg font-mono font-bold mb-1'>0.95</span>
									<p className='text-xs text-muted-foreground'>
										Rating decay per inactive season
									</p>
								</div>

								<div className='bg-muted/20 p-3 rounded-lg border flex flex-col justify-center items-center text-center min-h-[80px]'>
									<span className='text-xs font-medium text-muted-foreground mb-1'>
										MAX DIFFERENTIAL
									</span>
									<span className='text-lg font-mono font-bold mb-1'>10</span>
									<p className='text-xs text-muted-foreground'>
										Full weight point differential threshold
									</p>
								</div>
							</div>
						</div>

						{/* Activity and Status */}
						<div>
							<h4 className='font-semibold mb-2'>Activity Classification</h4>
							<div className='space-y-1 text-xs'>
								<div className='flex items-center gap-2'>
									<div className='w-2 h-2 bg-green-500 rounded-full'></div>
									<span>
										<strong>Active:</strong> Played in current/recent season
									</span>
								</div>
								<div className='flex items-center gap-2'>
									<div className='w-2 h-2 bg-gray-400 rounded-full'></div>
									<span>
										<strong>Inactive:</strong> 3+ seasons without games (rating
										preserved)
									</span>
								</div>
							</div>
							<p className='text-xs text-muted-foreground mt-2'>
								Players who return from retirement automatically reactivate when
								they play again.
							</p>
						</div>

						{/* Calculation Notes */}
						<div className='border-t pt-4'>
							<h4 className='font-semibold mb-2 text-xs'>Technical Notes</h4>
							<ul className='text-xs text-muted-foreground space-y-1'>
								<li>• Rankings recalculated after each game completion</li>
								<li>• Weekly snapshots preserve rating progression history</li>
								<li>
									• Team confidence scoring handles mixed veteran/rookie rosters
								</li>
								<li>
									• Mathematical precision ensures deterministic, reproducible
									results
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
										<TableHead className='w-32 text-center'>Status</TableHead>
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
											<TableCell className='text-center'>
												<Skeleton className='h-6 w-16 mx-auto rounded-full opacity-20' />
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
										<TableHead className='w-32 text-center'>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rankings.map((player) => (
										<TableRow
											key={player.id}
											onClick={() => handlePlayerClick(player.id)}
											className={cn(
												'hover:bg-muted/50 cursor-pointer transition-colors',
												player.rank <= 3 &&
													'bg-gradient-to-r from-yellow-50 to-transparent dark:from-yellow-900/20'
											)}
										>
											<TableCell className='font-medium'>
												<div className='flex items-center gap-2'>
													{player.rank === 1 && (
														<Crown className='h-4 w-4 text-yellow-500' />
													)}
													{player.rank === 2 && (
														<Award className='h-4 w-4 text-gray-400' />
													)}
													{player.rank === 3 && (
														<Medal className='h-4 w-4 text-amber-600' />
													)}
													#{player.rank}
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
													{player.seasonStats.length > 0 && (
														<div
															className={cn(
																'text-xs text-muted-foreground',
																player.rank <= 3 && 'dark:text-muted-foreground'
															)}
														></div>
													)}
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
											<TableCell className='text-center'>
												<Badge
													variant={player.isActive ? 'default' : 'secondary'}
													className={cn(
														player.isActive
															? 'bg-green-100 text-green-800 hover:bg-green-200'
															: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
													)}
												>
													{player.isActive ? 'Active' : 'Inactive'}
												</Badge>
											</TableCell>
										</TableRow>
									))}
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
