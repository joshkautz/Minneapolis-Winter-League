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
									className='group hover:bg-muted/70 transition-colors relative'
								>
									<TableCell className='font-medium text-center' role='cell'>
										{rankValue}
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
										{wins}
									</TableCell>
									<TableCell className='text-center font-medium' role='cell'>
										{losses}
									</TableCell>
									<TableCell
										className={cn(
											'text-center font-medium',
											getColor(gamesPlayed, differential)
										)}
										role='cell'
									>
										{differential > 0 ? '+' : ''}
										{differential}
									</TableCell>
									<Link
										to={`/teams/${team?.id}`}
										className='absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded-sm cursor-pointer'
										aria-label={`View ${teamDocument?.name} team details`}
									/>
								</TableRow>
							)
						})}
				</TableBody>
			</Table>
		</div>
	)
}
