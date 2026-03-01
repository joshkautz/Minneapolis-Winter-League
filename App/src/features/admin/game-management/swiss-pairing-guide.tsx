/**
 * Swiss Pairing Guide component
 *
 * Displays suggested matchups based on current Swiss standings
 * to help admins create games for the upcoming week
 */

import { useMemo } from 'react'
import { Info } from 'lucide-react'
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
import { useSwissStandings, sortBySwissScore } from '@/shared/hooks'
import { QuerySnapshot } from '@/firebase'
import { GameDocument, TeamDocument } from '@/types'

interface SwissPairingGuideProps {
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
}

/**
 * Swiss pairing template
 * Teams are grouped into brackets by rank for competitive matchups
 */
const PAIRING_TEMPLATE = [
	{
		round: 1,
		fieldA: [1, 2],
		fieldB: [6, 5],
		fieldC: [7, 8],
	},
	{
		round: 2,
		fieldA: [1, 3],
		fieldB: [6, 10],
		fieldC: [7, 11],
	},
	{
		round: 3,
		fieldA: [2, 4],
		fieldB: [5, 9],
		fieldC: [8, 12],
	},
	{
		round: 4,
		fieldA: [3, 4],
		fieldB: [10, 9],
		fieldC: [11, 12],
	},
]

export const SwissPairingGuide = ({
	gamesQuerySnapshot,
	teamsQuerySnapshot,
}: SwissPairingGuideProps) => {
	const standings = useSwissStandings(gamesQuerySnapshot)

	// Get sorted team list by Swiss score
	const rankedTeams = useMemo(() => {
		const entries = Object.entries(standings)
		entries.sort(sortBySwissScore)
		return entries.map(([teamId], index) => ({
			teamId,
			rank: index + 1,
		}))
	}, [standings])

	// Create a map of teamId to team name
	const teamNameMap = useMemo(() => {
		const map = new Map<string, string>()
		teamsQuerySnapshot?.docs.forEach((doc) => {
			map.set(doc.id, doc.data().name)
		})
		return map
	}, [teamsQuerySnapshot])

	// Get team name by rank (1-indexed)
	const getTeamByRank = (rank: number): string => {
		const team = rankedTeams[rank - 1]
		if (!team) return `Rank ${rank}`
		return teamNameMap.get(team.teamId) || `Rank ${rank}`
	}

	// Format a matchup cell
	const formatMatchup = (ranks: number[]): string => {
		const team1 = getTeamByRank(ranks[0])
		const team2 = getTeamByRank(ranks[1])
		return `${team1} vs ${team2}`
	}

	// Check if we have enough teams for the guide
	const hasEnoughTeams = rankedTeams.length >= 12

	if (!hasEnoughTeams && rankedTeams.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Info className='h-4 w-4 text-blue-600' />
						Swiss Pairing Guide
					</CardTitle>
					<CardDescription>
						No standings data available yet. Play some games first to see
						suggested pairings.
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
								Swiss pairings match teams with similar rankings. Top teams play
								on Field A, middle teams on Field B, and developing teams on
								Field C for competitive games.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Suggested matchups based on current standings
					{!hasEnoughTeams && rankedTeams.length > 0 && (
						<span className='text-amber-600 ml-2'>
							(Only {rankedTeams.length} teams have played - need 12 for full
							pairings)
						</span>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='overflow-x-auto'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-20'>Round</TableHead>
								<TableHead>Field A (Top)</TableHead>
								<TableHead>Field B (Middle)</TableHead>
								<TableHead>Field C (Developing)</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{PAIRING_TEMPLATE.map((row) => (
								<TableRow key={row.round}>
									<TableCell className='font-medium'>{row.round}</TableCell>
									<TableCell className='text-sm'>
										{formatMatchup(row.fieldA)}
									</TableCell>
									<TableCell className='text-sm'>
										{formatMatchup(row.fieldB)}
									</TableCell>
									<TableCell className='text-sm'>
										{formatMatchup(row.fieldC)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	)
}
