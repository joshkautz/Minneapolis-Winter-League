import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { QuerySnapshot } from '@/firebase/firestore'
import { TeamDocument } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'
import { cn } from '@/shared/utils'
import { Link } from 'react-router-dom'

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
							<abbr title='Point Differential'>+/-</abbr>
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
								<TableRow key={key} className='hover:bg-muted/50'>
									<TableCell className='font-medium text-center' role='cell'>
										{rankValue}
									</TableCell>
									<TableCell role='cell'>
										<Link
											to={`/teams/${team?.id}`}
											className='focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm'
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
												<span className='font-medium text-foreground hover:text-primary transition-colors truncate'>
													{teamDocument?.name}
												</span>
											</div>
										</Link>
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
								</TableRow>
							)
						})}
				</TableBody>
			</Table>
		</div>
	)
}
