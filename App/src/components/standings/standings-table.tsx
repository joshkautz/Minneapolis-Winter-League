import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { QuerySnapshot, DocumentData } from '@/firebase/firestore'
import { TeamData } from '@/lib/interfaces'
import { TeamStanding } from '@/lib/use-standings'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

export const StandingsTable = ({
	standings,
	teamsQuerySnapshot,
}: {
	standings: {
		[key: string]: {
			pointsFor: number
			pointsAgainst: number
			wins: number
			losses: number
			differential: number
		}
	}
	teamsQuerySnapshot: QuerySnapshot<TeamData, DocumentData> | undefined
}) => {
	const getColor = (value: number) => {
		if (value > 9) {
			return 'text-green-600'
		}
		if (value < -9) {
			return 'text-destructive'
		}
		return ''
	}

	const sortByWinsThenDiff = (
		a: [string, TeamStanding],
		b: [string, TeamStanding]
	) => {
		if (a[1].wins > b[1].wins) {
			return -1
		}
		if (a[1].wins < b[1].wins) {
			return 1
		}
		if (a[1].differential > b[1].differential) {
			return -1
		}
		if (a[1].differential < b[1].differential) {
			return 1
		}
		return 0
	}

	return (
		<Table>
			<TableCaption></TableCaption>
			<TableHeader>
				<TableRow>
					<TableHead>Rank</TableHead>
					<TableHead>Team</TableHead>
					<TableHead>W</TableHead>
					<TableHead>L</TableHead>
					<TableHead>+/-</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{Object.entries(standings)
					.sort((a, b) => sortByWinsThenDiff(a, b))
					.map(([key, { wins, losses, pointsFor, pointsAgainst }], index) => {
						const team = teamsQuerySnapshot?.docs.find(
							(team) => team.id === key
						)
						const teamData = teamsQuerySnapshot?.docs
							.find((team) => team.id === key)
							?.data()
						return (
							<TableRow key={index}>
								<TableCell className="font-medium ">{index + 1}</TableCell>
								<TableCell>
									<Link to={`/teams/${team?.id}`}>
										<div className="flex items-center justify-start gap-2 ">
											<div className="flex justify-start w-16">
												<img
													className={cn(
														'w-8 h-8 rounded-full object-cover bg-muted',
														!teamData?.logo &&
															'bg-gradient-to-r from-primary to-sky-300'
													)}
													src={teamData?.logo}
												/>
											</div>
											<span>{teamData?.name}</span>
										</div>
									</Link>
								</TableCell>
								<TableCell>{wins}</TableCell>
								<TableCell>{losses}</TableCell>
								<TableCell className={getColor(pointsFor - pointsAgainst)}>
									{pointsFor - pointsAgainst}
								</TableCell>
							</TableRow>
						)
					})}
			</TableBody>
		</Table>
	)
}
