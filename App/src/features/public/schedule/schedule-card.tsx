import { GameDocument, hasAssignedTeams } from '@/shared/utils'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { useTeamsContext } from '@/providers'
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from '@/components/ui/tooltip'
import { TeamIcon } from './team-icon'
import { useIsMobile } from '@/shared/hooks/use-mobile'

export const ScheduleCard = ({
	games,
	title,
}: {
	games: GameDocument[]
	title: string
}) => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const isMobile = useIsMobile()

	return (
		<Card className='w-full'>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>
					{games
						.find((game) => game)
						?.date.toDate()
						.toLocaleString(undefined, {
							weekday: 'long', // Full weekday name
							month: 'long', // Full month name
							day: 'numeric', // Day of the month
							hour: 'numeric', // Hour (1-12)
							minute: '2-digit', // Minute (2-digit)
							hour12: true, // Use 12-hour clock format (AM/PM)
						})}
				</CardDescription>
			</CardHeader>
			<CardContent className='flex flex-col gap-3'>
				{games
					.sort((a, b) => a.field - b.field)
					.map((game, index) => {
						let homeTeam, awayTeam

						if (hasAssignedTeams(game)) {
							homeTeam = selectedSeasonTeamsQuerySnapshot?.docs.find(
								(team) => team.id === game.home.id
							)
							awayTeam = selectedSeasonTeamsQuerySnapshot?.docs.find(
								(team) => team.id === game.away.id
							)
						}

						// on mobile, show the team name only, not the logo
						return (
							<div
								key={`schedule-row-${index}`}
								className='flex min-h-10 items-center gap-3'
							>
								<div className='w-16 shrink-0 text-sm'>Field {index + 1}</div>
								<div className='grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3'>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className='flex min-w-0 items-center justify-start gap-1'>
													{!isMobile && <TeamIcon team={homeTeam} />}
													<span className='text-foreground truncate text-xs font-medium'>
														{homeTeam?.data().name || 'To Be Determined'}
													</span>
												</div>
											</TooltipTrigger>
											<TooltipContent>
												<p>{homeTeam?.data().name || 'To Be Determined'}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<p className='w-14 shrink-0 select-none text-center text-sm'>
										{game.date.toDate() > new Date()
											? 'vs'
											: game.homeScore === null || game.awayScore === null
												? 'vs'
												: `${game.homeScore} - ${game.awayScore}`}
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className='flex min-w-0 items-center justify-start gap-1'>
													{!isMobile && <TeamIcon team={awayTeam} />}
													<span className='text-foreground truncate text-xs font-medium'>
														{awayTeam?.data().name || 'To Be Determined'}
													</span>
												</div>
											</TooltipTrigger>
											<TooltipContent>
												<p>{awayTeam?.data().name || 'To Be Determined'}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						)
					})}
			</CardContent>
		</Card>
	)
}
