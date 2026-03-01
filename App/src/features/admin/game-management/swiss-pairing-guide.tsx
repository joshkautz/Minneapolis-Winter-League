/**
 * Swiss Pairing Guide component (Monrad System)
 *
 * Displays suggested matchups based on current Swiss standings
 * using the Monrad system to avoid repeat matchups.
 */

import { useMemo } from 'react'
import { Info, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useSwissStandings } from '@/shared/hooks'
import {
	useMonradPairings,
	getMatchupCount,
} from '@/shared/hooks/use-monrad-pairings'
import { QuerySnapshot } from '@/firebase'
import { GameDocument, TeamDocument } from '@/types'

interface SwissPairingGuideProps {
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
}

export const SwissPairingGuide = ({
	gamesQuerySnapshot,
	teamsQuerySnapshot,
}: SwissPairingGuideProps) => {
	const standings = useSwissStandings(gamesQuerySnapshot)
	const { pairings, bye } = useMonradPairings(
		standings,
		gamesQuerySnapshot,
		teamsQuerySnapshot
	)

	// Create a map of teamId to team name
	const teamNameMap = useMemo(() => {
		const map = new Map<string, string>()
		teamsQuerySnapshot?.docs.forEach((doc) => {
			map.set(doc.id, doc.data().name)
		})
		return map
	}, [teamsQuerySnapshot])

	// Get team name by ID
	const getTeamName = (teamId: string): string => {
		return teamNameMap.get(teamId) || teamId
	}

	// Count total past games for context
	const totalGamesPlayed =
		gamesQuerySnapshot?.docs.filter((doc) => {
			const game = doc.data()
			return game.homeScore !== null && game.awayScore !== null
		}).length || 0

	// Count repeat matchups in suggestions
	const repeatCount = pairings.filter((p) => p.isRepeat).length

	// Assign field labels based on ranking brackets
	// Field A: Top teams, Field B: Middle teams, Field C: Developing teams
	const getFieldLabel = (index: number): string => {
		const labels = ['A', 'B', 'C', 'A', 'B', 'C']
		return `Field ${labels[index] || String.fromCharCode(65 + (index % 3))}`
	}

	// Get bracket label based on average rank
	const getBracketLabel = (rank1: number, rank2: number): string => {
		const avgRank = (rank1 + rank2) / 2
		if (avgRank <= 4) return 'Top'
		if (avgRank <= 8) return 'Middle'
		return 'Developing'
	}

	if (pairings.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Info className='h-4 w-4 text-blue-600' />
						Swiss Pairing Guide (Monrad)
					</CardTitle>
					<CardDescription>
						{teamsQuerySnapshot && teamsQuerySnapshot.docs.length > 0
							? 'No standings data available yet. Pairings will be generated after games are played.'
							: 'No teams found for this season.'}
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2 text-base'>
					<Info className='h-4 w-4 text-blue-600' />
					Swiss Pairing Guide (Monrad)
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type='button'
								className='cursor-help'
								aria-label='About Monrad Pairing'
							>
								<Info className='h-4 w-4 text-muted-foreground' />
							</button>
						</TooltipTrigger>
						<TooltipContent className='max-w-xs'>
							<p>
								Monrad pairings match teams by similar rankings while avoiding
								repeat matchups. Teams play opponents they haven&apos;t faced
								yet whenever possible.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription className='flex items-center gap-4'>
					<span>
						Suggested matchups for next week based on current standings
					</span>
					{totalGamesPlayed > 0 && (
						<Badge variant='outline' className='text-xs'>
							{totalGamesPlayed} games played
						</Badge>
					)}
					{repeatCount > 0 && (
						<Badge variant='secondary' className='text-xs text-amber-600'>
							<RefreshCw className='h-3 w-3 mr-1' />
							{repeatCount} repeat{repeatCount > 1 ? 's' : ''} unavoidable
						</Badge>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='overflow-x-auto'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-24'>Field</TableHead>
								<TableHead>Matchup</TableHead>
								<TableHead className='w-24 text-center'>Ranks</TableHead>
								<TableHead className='w-28 text-center'>Bracket</TableHead>
								<TableHead className='w-24 text-center'>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{pairings.map((pairing, index) => {
								const matchupCount = getMatchupCount(
									pairing.team1Id,
									pairing.team2Id,
									gamesQuerySnapshot
								)

								return (
									<TableRow key={`${pairing.team1Id}-${pairing.team2Id}`}>
										<TableCell className='font-medium'>
											{getFieldLabel(index)}
										</TableCell>
										<TableCell>
											<span className='font-medium'>
												{getTeamName(pairing.team1Id)}
											</span>
											<span className='text-muted-foreground mx-2'>vs</span>
											<span className='font-medium'>
												{getTeamName(pairing.team2Id)}
											</span>
										</TableCell>
										<TableCell className='text-center text-muted-foreground'>
											#{pairing.team1Rank} vs #{pairing.team2Rank}
										</TableCell>
										<TableCell className='text-center'>
											<Badge variant='outline' className='text-xs'>
												{getBracketLabel(pairing.team1Rank, pairing.team2Rank)}
											</Badge>
										</TableCell>
										<TableCell className='text-center'>
											{pairing.isRepeat ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className='inline-flex items-center text-amber-600'>
															<RefreshCw className='h-4 w-4' />
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															Repeat matchup ({matchupCount} previous game
															{matchupCount > 1 ? 's' : ''}) - no other
															opponents available
														</p>
													</TooltipContent>
												</Tooltip>
											) : (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className='inline-flex items-center text-green-600'>
															<CheckCircle2 className='h-4 w-4' />
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>First time matchup</p>
													</TooltipContent>
												</Tooltip>
											)}
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>

				{bye && (
					<div className='mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-md flex items-center gap-2'>
						<AlertTriangle className='h-4 w-4 text-amber-600' />
						<span className='text-sm text-amber-800 dark:text-amber-200'>
							<strong>{getTeamName(bye)}</strong> has a bye this week (odd
							number of teams)
						</span>
					</div>
				)}

				<div className='mt-4 text-xs text-muted-foreground'>
					<p>
						<strong>How it works:</strong> Teams are paired by Swiss ranking,
						with higher-ranked teams playing each other. The algorithm avoids
						repeat matchups whenever possible, finding the next-closest ranked
						opponent if needed.
					</p>
				</div>
			</CardContent>
		</Card>
	)
}
