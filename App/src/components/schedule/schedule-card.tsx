import { GameData } from '@/lib/interfaces'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { useTeamsContext } from '@/contexts/teams-context'
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from '@/components/ui/tooltip'
import { TeamIcon } from './team-icon'

export const ScheduleCard = ({
	games,
	title,
}: {
	games: GameData[]
	title: string
}) => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()

	return (
		<Card className={'flex-1 shrink-0 basis-80'}>
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
			<CardContent className="flex flex-col gap-2">
				{games
					.sort((a, b) => a.field - b.field)
					.map((game, index) => {
						const homeTeam = selectedSeasonTeamsQuerySnapshot?.docs.find(
							(team) => team.id === game.home.id
						)

						const awayTeam = selectedSeasonTeamsQuerySnapshot?.docs.find(
							(team) => team.id === game.away.id
						)

						return (
							<div
								key={`schedule-row-${index}`}
								className={'flex items-center justify-start max-h-10'}
							>
								<div className={'flex-1'}>Field {index + 1}</div>
								<div
									className={'flex-4 flex justify-center gap-4 items-center'}
								>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className={'flex-1'}>
													<TeamIcon team={homeTeam} />
												</div>
											</TooltipTrigger>
											<TooltipContent>
												<p>{homeTeam?.data().name}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<p className={'flex-1 select-none text-center'}>
										{game.date.toDate() > new Date()
											? 'vs'
											: game.homeScore === null || game.awayScore === null
												? 'vs'
												: `${game.homeScore} - ${game.awayScore}`}
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className={'flex-1'}>
													<TeamIcon team={awayTeam} />
												</div>
											</TooltipTrigger>
											<TooltipContent>
												<p>{awayTeam?.data().name}</p>
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
