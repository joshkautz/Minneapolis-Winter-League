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
import { QuerySnapshot } from '@/firebase/firestore'
import { TeamDocument, cn } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'

interface SharedStandingsTableProps {
	data: {
		[key: string]: TeamStanding
	}
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
	sortFunction: (a: [string, TeamStanding], b: [string, TeamStanding]) => number
	rankColumnHeader: string
	useTeamPlacement?: boolean
	'aria-label'?: string
}

export const SharedStandingsTable = ({
	data,
	teamsQuerySnapshot,
	sortFunction,
	rankColumnHeader,
	useTeamPlacement = false,
	'aria-label': ariaLabel,
}: SharedStandingsTableProps) => {
	const getColor = (gamesPlayed: number, pointDiff: number) => {
		if (pointDiff > gamesPlayed * 5) {
			return 'text-green-600'
		}
		if (pointDiff < gamesPlayed * -5) {
			return 'text-destructive'
		}
		return ''
	}

	const getRankValue = (
		key: string,
		index: number,
		useTeamPlacement: boolean
	) => {
		if (useTeamPlacement) {
			const placement = teamsQuerySnapshot?.docs
				.find((team) => team.id === key)
				?.data()?.placement
			return placement || index + 1
		}
		return index + 1
	}

	return (
		<div className='w-full overflow-x-auto'>
			<Table aria-label={ariaLabel} className='min-w-full'>
				<TableCaption className='sr-only'>
					{ariaLabel || 'Team standings table'}
				</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead className='w-16 text-center' scope='col'>
							{rankColumnHeader}
						</TableHead>
						<TableHead className='min-w-48 text-left' scope='col'>
							Team
						</TableHead>
						<TableHead className='w-12 text-center' scope='col'>
							<abbr title='Wins'>W</abbr>
						</TableHead>
						<TableHead className='w-12 text-center' scope='col'>
							<abbr title='Losses'>L</abbr>
						</TableHead>
						<TableHead className='w-16 text-center' scope='col'>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type='button'
										className='cursor-help font-medium'
										aria-label='Point Differential - The difference between points scored and points allowed'
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
					{Object.entries(data)
						.sort(sortFunction)
						.map(([key, { wins, losses, pointsFor, pointsAgainst }], index) => {
							const team = teamsQuerySnapshot?.docs.find(
								(team) => team.id === key
							)
							const teamDocument = teamsQuerySnapshot?.docs
								.find((team) => team.id === key)
								?.data()
							const url = teamDocument?.logo
							const differential = pointsFor - pointsAgainst
							const gamesPlayed = wins + losses
							const rankValue = getRankValue(key, index, useTeamPlacement)

							return (
								<TableRow
									key={key}
									className='group cursor-pointer hover:bg-muted/70 transition-colors'
								>
									<TableCell className='font-medium text-center' role='cell'>
										<Link
											to={`/teams/${team?.id}`}
											className='block w-full h-full focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
											aria-label={`View ${teamDocument?.name} team details`}
											tabIndex={-1}
										>
											{rankValue}
										</Link>
									</TableCell>
									<TableCell role='cell'>
										<Link
											to={`/teams/${team?.id}`}
											className='block w-full focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
											aria-label={`View ${teamDocument?.name} team details`}
										>
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
										</Link>
									</TableCell>
									<TableCell className='text-center font-medium' role='cell'>
										<Link
											to={`/teams/${team?.id}`}
											className='block w-full h-full focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
											aria-label={`View ${teamDocument?.name} team details`}
											tabIndex={-1}
										>
											{wins}
										</Link>
									</TableCell>
									<TableCell className='text-center font-medium' role='cell'>
										<Link
											to={`/teams/${team?.id}`}
											className='block w-full h-full focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
											aria-label={`View ${teamDocument?.name} team details`}
											tabIndex={-1}
										>
											{losses}
										</Link>
									</TableCell>
									<TableCell
										className={cn(
											'text-center font-medium',
											getColor(gamesPlayed, differential)
										)}
										role='cell'
									>
										<Link
											to={`/teams/${team?.id}`}
											className='block w-full h-full focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
											aria-label={`View ${teamDocument?.name} team details`}
											tabIndex={-1}
										>
											{differential > 0 ? '+' : ''}
											{differential}
										</Link>
									</TableCell>
								</TableRow>
							)
						})}
				</TableBody>
			</Table>
		</div>
	)
}
