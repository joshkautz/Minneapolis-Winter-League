import { Link } from 'react-router-dom'
import { GameDocument, hasAssignedTeams } from '@/shared/utils'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { useTeamsContext } from '@/providers'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { TeamIcon } from './team-icon'

export const ScheduleCard = ({
	games,
	title,
}: {
	games: GameDocument[]
	title: string
}) => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()

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
								(team) =>
									canonicalTeamIdFromTeamSeasonDoc(team) === game.home?.id
							)
							awayTeam = selectedSeasonTeamsQuerySnapshot?.docs.find(
								(team) =>
									canonicalTeamIdFromTeamSeasonDoc(team) === game.away?.id
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
									{homeTeam ? (
										<Link
											to={`/teams/${canonicalTeamIdFromTeamSeasonDoc(homeTeam)}/${homeTeam.id}`}
											className='inline-flex min-w-0 max-w-full items-center justify-self-end gap-3 hover:underline'
										>
											<span className='text-foreground truncate text-xs font-medium'>
												{game.homeName ?? homeTeam.data().name}
											</span>
											<TeamIcon team={homeTeam} />
										</Link>
									) : (
										<div className='inline-flex min-w-0 max-w-full items-center justify-self-end gap-3'>
											<span className='text-foreground truncate text-xs font-medium'>
												To Be Determined
											</span>
											<TeamIcon team={homeTeam} />
										</div>
									)}
									<p className='w-14 shrink-0 select-none text-center text-sm'>
										{game.date.toDate() > new Date()
											? 'vs'
											: game.homeScore === null || game.awayScore === null
												? 'vs'
												: `${game.homeScore} - ${game.awayScore}`}
									</p>
									{awayTeam ? (
										<Link
											to={`/teams/${canonicalTeamIdFromTeamSeasonDoc(awayTeam)}/${awayTeam.id}`}
											className='inline-flex min-w-0 max-w-full items-center justify-self-start gap-3 hover:underline'
										>
											<TeamIcon team={awayTeam} />
											<span className='text-foreground truncate text-xs font-medium'>
												{game.awayName ?? awayTeam.data().name}
											</span>
										</Link>
									) : (
										<div className='inline-flex min-w-0 max-w-full items-center justify-self-start gap-3'>
											<TeamIcon team={awayTeam} />
											<span className='text-foreground truncate text-xs font-medium'>
												To Be Determined
											</span>
										</div>
									)}
								</div>
							</div>
						)
					})}
			</CardContent>
		</Card>
	)
}
