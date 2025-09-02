import { QuerySnapshot } from '@/firebase/firestore'
import { TeamDocument } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'
import { SharedStandingsTable } from './shared-standings-table'

export const ResultsTable = ({
	results,
	teamsQuerySnapshot,
}: {
	results: {
		[key: string]: TeamStanding
	}
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
}) => {
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
		<SharedStandingsTable
			data={results}
			teamsQuerySnapshot={teamsQuerySnapshot}
			sortFunction={sortByPlacement}
			rankColumnHeader='Placement'
			useTeamPlacement={true}
			aria-label='Playoff results showing final team placements, wins, losses, and point differential'
		/>
	)
}
