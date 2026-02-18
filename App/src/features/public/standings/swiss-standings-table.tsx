/**
 * Swiss Standings Table component
 *
 * Displays standings for Swiss-format seasons sorted by Swiss score
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
	Table,
	TableBody,
	TableCaption,
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
import { QuerySnapshot } from '@/firebase'
import { TeamDocument, cn } from '@/shared/utils'
import { SwissTeamStanding, sortBySwissScore } from '@/shared/hooks'

interface SwissStandingsTableProps {
	standings: Record<string, SwissTeamStanding>
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
}

export const SwissStandingsTable = ({
	standings,
	teamsQuerySnapshot,
}: SwissStandingsTableProps) => {
	// Create a Map for O(1) team lookups
	const teamMap = useMemo(() => {
		const map = new Map<string, { id: string; data: TeamDocument }>()
		teamsQuerySnapshot?.docs.forEach((doc) => {
			map.set(doc.id, { id: doc.id, data: doc.data() })
		})
		return map
	}, [teamsQuerySnapshot])

	const getColor = (gamesPlayed: number, pointDiff: number) => {
		if (pointDiff > gamesPlayed * 5) {
			return 'text-green-600'
		}
		if (pointDiff < gamesPlayed * -5) {
			return 'text-destructive'
		}
		return ''
	}

	// Sort by Swiss score and assign ranks
	const sortedStandings = useMemo(() => {
		const entries = Object.entries(standings)
		entries.sort(sortBySwissScore)

		// Simple 1-based ranking (sorted by Swiss score)
		return entries.map(([teamId, standing], index) => ({
			teamId,
			standing,
			rank: index + 1,
		}))
	}, [standings])

	return (
		<div className='w-full overflow-x-auto'>
			<Table
				aria-label='Swiss standings showing team rankings with Buchholz scores'
				className='min-w-full'
			>
				<TableCaption className='sr-only'>
					Swiss standings table with Buchholz and Swiss scores
				</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead className='w-16 text-center' scope='col'>
							Rank
						</TableHead>
						<TableHead className='min-w-48 text-left' scope='col'>
							Team
						</TableHead>
						<TableHead className='w-12 text-center' scope='col'>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type='button'
										className='cursor-help font-medium'
										aria-label='Wins'
									>
										W
									</button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Wins</p>
								</TooltipContent>
							</Tooltip>
						</TableHead>
						<TableHead className='w-12 text-center' scope='col'>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type='button'
										className='cursor-help font-medium'
										aria-label='Losses'
									>
										L
									</button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Losses</p>
								</TooltipContent>
							</Tooltip>
						</TableHead>
						<TableHead className='w-16 text-center' scope='col'>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type='button'
										className='cursor-help font-medium'
										aria-label='Point Differential'
									>
										+/-
									</button>
								</TooltipTrigger>
								<TooltipContent>
									<p>
										Point Differential: The difference between points scored and
										points allowed
									</p>
								</TooltipContent>
							</Tooltip>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedStandings.map(({ teamId, standing, rank }) => {
						const teamEntry = teamMap.get(teamId)
						const teamDocument = teamEntry?.data
						const url = teamDocument?.logo
						const gamesPlayed = standing.wins + standing.losses

						return (
							<TableRow
								key={teamId}
								className='group hover:bg-muted/70 transition-colors relative'
							>
								<TableCell className='font-medium text-center' role='cell'>
									{rank}
								</TableCell>
								<TableCell role='cell'>
									<div className='flex items-center gap-3 py-1'>
										<div className='flex-shrink-0 w-10 h-10 flex items-center justify-center'>
											{url ? (
												<img
													className='w-8 h-8 rounded-full object-cover bg-muted border border-border'
													src={url}
													alt={`${teamDocument?.name} logo`}
													loading='lazy'
												/>
											) : (
												<div
													className='w-8 h-8 rounded-full bg-gradient-to-r from-primary to-sky-300 border border-border'
													aria-label={`${teamDocument?.name} default logo`}
													role='img'
												/>
											)}
										</div>
										<span className='font-medium text-foreground group-hover:text-primary transition-colors truncate'>
											{teamDocument?.name}
										</span>
									</div>
								</TableCell>
								<TableCell className='text-center font-medium' role='cell'>
									{standing.wins}
								</TableCell>
								<TableCell className='text-center font-medium' role='cell'>
									{standing.losses}
								</TableCell>
								<TableCell
									className={cn(
										'text-center font-medium',
										getColor(gamesPlayed, standing.differential)
									)}
									role='cell'
								>
									{standing.differential > 0 ? '+' : ''}
									{standing.differential}
									{/* Link overlay for entire row */}
									<Link
										to={`/teams/${teamEntry?.id}`}
										className='absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded-sm cursor-pointer'
										aria-label={`View ${teamDocument?.name} team details`}
									/>
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
