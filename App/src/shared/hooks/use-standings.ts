import { useMemo } from 'react'
import { DocumentData, QuerySnapshot } from '@/firebase/firestore'
import { GameDocument } from '@/shared/utils'

export type TeamStanding = {
	pointsFor: number
	pointsAgainst: number
	wins: number
	losses: number
	differential: number
}

export const useStandings = (
	gamesQuerySnapshot: QuerySnapshot<GameDocument, DocumentData> | undefined
) => {
	const standings = useMemo(() => {
		const result: {
			[key: string]: TeamStanding
		} = {}

		gamesQuerySnapshot?.docs.forEach((gameQueryDocumentSnapshot) => {
			const { home, away, homeScore, awayScore } =
				gameQueryDocumentSnapshot.data()

			const updateTeamStanding = (
				teamId: string,
				pointsFor: number,
				pointsAgainst: number
			) => {
				const teamStats = result[teamId] ?? {
					pointsFor: 0,
					pointsAgainst: 0,
					wins: 0,
					losses: 0,
					differential: 0,
				}

				result[teamId] = {
					pointsFor: teamStats.pointsFor + pointsFor,
					pointsAgainst: teamStats.pointsAgainst + pointsAgainst,
					differential: teamStats.differential + (pointsFor - pointsAgainst),
					wins: teamStats.wins + (pointsFor > pointsAgainst ? 1 : 0),
					losses: teamStats.losses + (pointsFor < pointsAgainst ? 1 : 0),
				}
			}

			updateTeamStanding(home.id, homeScore, awayScore)
			updateTeamStanding(away.id, awayScore, homeScore)
		})

		return result
	}, [gamesQuerySnapshot])

	return standings
}
