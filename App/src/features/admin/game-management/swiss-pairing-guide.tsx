/**
 * Swiss Pairing Guide component (Monrad System)
 *
 * Displays a complete game day schedule (4 rounds × 3 fields = 12 games)
 * based on current Swiss standings. Each team plays twice with no double-byes.
 * Repeat matchups from earlier in the season are flagged.
 */

import { useMemo } from 'react'
import { Info, RefreshCw, CheckCircle2 } from 'lucide-react'
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
import { useMonradPairings } from '@/shared/hooks/use-monrad-pairings'
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
	const { games, repeatCount } = useMonradPairings(
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

	// Group games by round
	const gamesByRound = useMemo(() => {
		const grouped = new Map<number, typeof games>()
		for (let r = 1; r <= 4; r++) {
			grouped.set(
				r,
				games.filter((g) => g.round === r)
			)
		}
		return grouped
	}, [games])

	// Count total games played this season
	const totalGamesPlayed =
		gamesQuerySnapshot?.docs.filter((doc) => {
			const game = doc.data()
			return game.homeScore !== null && game.awayScore !== null
		}).length || 0

	if (games.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Info className='h-4 w-4 text-blue-600' />
						Swiss Pairing Guide
					</CardTitle>
					<CardDescription>
						{teamsQuerySnapshot && teamsQuerySnapshot.docs.length >= 12
							? 'No standings data available yet. Pairings will appear after games are played.'
							: `Need 12 teams for Swiss pairings. Currently have ${teamsQuerySnapshot?.docs.length || 0} teams.`}
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
					Swiss Pairing Guide
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type='button'
								className='cursor-help'
								aria-label='About Swiss Pairing'
							>
								<Info className='h-4 w-4 text-muted-foreground' />
							</button>
						</TooltipTrigger>
						<TooltipContent className='max-w-xs'>
							<p>
								Teams are grouped by rank into brackets (Top, Middle,
								Developing) and play twice per game day. No team sits out more
								than one consecutive round.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription className='flex flex-wrap items-center gap-2'>
					<span>Suggested schedule based on current standings</span>
					{totalGamesPlayed > 0 && (
						<Badge variant='outline' className='text-xs'>
							{totalGamesPlayed} games played this season
						</Badge>
					)}
					{repeatCount > 0 && (
						<Badge variant='secondary' className='text-xs text-amber-600'>
							<RefreshCw className='h-3 w-3 mr-1' />
							{repeatCount} repeat{repeatCount > 1 ? 's' : ''} from earlier
						</Badge>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-1'>
				<div className='overflow-x-auto'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-20'>Round</TableHead>
								<TableHead>
									Field A{' '}
									<span className='text-muted-foreground font-normal'>
										(Top)
									</span>
								</TableHead>
								<TableHead>
									Field B{' '}
									<span className='text-muted-foreground font-normal'>
										(Middle)
									</span>
								</TableHead>
								<TableHead>
									Field C{' '}
									<span className='text-muted-foreground font-normal'>
										(Developing)
									</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[1, 2, 3, 4].map((round) => {
								const roundGames = gamesByRound.get(round) || []
								const fieldA = roundGames.find((g) => g.field === 'A')
								const fieldB = roundGames.find((g) => g.field === 'B')
								const fieldC = roundGames.find((g) => g.field === 'C')

								return (
									<TableRow key={round}>
										<TableCell className='font-medium'>{round}</TableCell>
										<TableCell>
											<MatchupCell game={fieldA} getTeamName={getTeamName} />
										</TableCell>
										<TableCell>
											<MatchupCell game={fieldB} getTeamName={getTeamName} />
										</TableCell>
										<TableCell>
											<MatchupCell game={fieldC} getTeamName={getTeamName} />
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>

				<div className='pt-3 flex items-center gap-4 text-xs text-muted-foreground'>
					<span className='flex items-center gap-1'>
						<CheckCircle2 className='h-3 w-3 text-green-600' />
						First matchup this season
					</span>
					<span className='flex items-center gap-1'>
						<RefreshCw className='h-3 w-3 text-amber-600' />
						Repeat matchup
					</span>
				</div>
			</CardContent>
		</Card>
	)
}

/**
 * Renders a single matchup cell with team names and repeat indicator
 */
const MatchupCell = ({
	game,
	getTeamName,
}: {
	game:
		| {
				team1Id: string
				team2Id: string
				team1Rank: number
				team2Rank: number
				isSeasonRepeat: boolean
				seasonMatchupCount: number
		  }
		| undefined
	getTeamName: (id: string) => string
}) => {
	if (!game) {
		return <span className='text-muted-foreground'>-</span>
	}

	return (
		<div className='flex items-center gap-2'>
			<div className='flex-1 min-w-0'>
				<span className='text-sm'>
					<span className='font-medium'>{getTeamName(game.team1Id)}</span>
					<span className='text-muted-foreground mx-1'>vs</span>
					<span className='font-medium'>{getTeamName(game.team2Id)}</span>
				</span>
				<span className='text-xs text-muted-foreground ml-2'>
					(#{game.team1Rank} vs #{game.team2Rank})
				</span>
			</div>
			{game.isSeasonRepeat ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className='flex-shrink-0 text-amber-600'>
							<RefreshCw className='h-4 w-4' />
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							Played {game.seasonMatchupCount} time
							{game.seasonMatchupCount > 1 ? 's' : ''} already this season
						</p>
					</TooltipContent>
				</Tooltip>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className='flex-shrink-0 text-green-600'>
							<CheckCircle2 className='h-4 w-4' />
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>First matchup this season</p>
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	)
}
