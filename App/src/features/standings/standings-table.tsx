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
import { TeamDocument } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'
import { cn } from '@/shared/utils'
import { Link } from 'react-router-dom'

export const StandingsTable = ({
	standings,
	teamsQuerySnapshot,
}: {
	standings: {
		[key: string]: TeamStanding
	}
	teamsQuerySnapshot: QuerySnapshot<TeamDocument, DocumentData> | undefined
}) => {
	const getColor = (gamesPlayed: number, pointDiff: number) => {
		if (pointDiff > gamesPlayed * 5) {
			return 'text-green-600'
		}
		if (pointDiff < gamesPlayed * -5) {
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
			<TableCaption />
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
						const url = teamData?.logo
						return (
							<TableRow key={index}>
								<TableCell className='font-medium '>{index + 1}</TableCell>
								<TableCell>
									<Link to={`/teams/${team?.id}`}>
										<div className='flex items-center justify-start gap-2 '>
											<div className='flex justify-start w-16'>
												{url ? (
													<img
														className={cn(
															'w-8 h-8 rounded-full object-cover bg-muted'
														)}
														src={url}
													/>
												) : (
													<img
														className={cn(
															'w-8 h-8 rounded-full object-cover bg-muted',
															'bg-linear-to-r from-primary to-sky-300'
														)}
													/>
												)}
											</div>
											<span>{teamData?.name}</span>
										</div>
									</Link>
								</TableCell>
								<TableCell>{wins}</TableCell>
								<TableCell>{losses}</TableCell>
								<TableCell
									className={getColor(wins + losses, pointsFor - pointsAgainst)}
								>
									{pointsFor - pointsAgainst}
								</TableCell>
							</TableRow>
						)
					})}
			</TableBody>
		</Table>
	)
}
