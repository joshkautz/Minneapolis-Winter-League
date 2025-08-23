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
import { TeamData } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'
import { cn } from '@/shared/utils'
import { Link } from 'react-router-dom'

export const ResultsTable = ({
	results,
	teamsQuerySnapshot,
}: {
	results: {
		[key: string]: TeamStanding
	}
	teamsQuerySnapshot: QuerySnapshot<TeamData, DocumentData> | undefined
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

	const sortByPlacement = (
		a: [string, TeamStanding],
		b: [string, TeamStanding]
	) => {
		const aPlacement = teamsQuerySnapshot?.docs
			.find((team) => team.id === a[0])
			?.data()?.placement
		const bPlacement = teamsQuerySnapshot?.docs
			.find((team) => team.id === b[0])
			?.data()?.placement
		if (aPlacement && bPlacement) {
			if (aPlacement < bPlacement) {
				return -1
			}
			if (aPlacement > bPlacement) {
				return 1
			}
		}
		return 0
	}

	return (
		<Table>
			<TableCaption />
			<TableHeader>
				<TableRow>
					<TableHead>Placement</TableHead>
					<TableHead>Team</TableHead>
					<TableHead>W</TableHead>
					<TableHead>L</TableHead>
					<TableHead>+/-</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{Object.entries(results)
					.sort((a, b) => sortByPlacement(a, b))
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
