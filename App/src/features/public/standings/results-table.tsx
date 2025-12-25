import { QuerySnapshot } from '@/firebase'
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

		const aHasPlacement = aPlacement !== null && aPlacement !== undefined
		const bHasPlacement = bPlacement !== null && bPlacement !== undefined

		// Both have placement - sort by placement (lower is better)
		if (aHasPlacement && bHasPlacement) {
			return aPlacement - bPlacement
		}

		// Only one has placement - that team comes first
		if (aHasPlacement) return -1
		if (bHasPlacement) return 1

		// Neither has placement - fall back to wins, then differential
		if (a[1].wins !== b[1].wins) {
			return b[1].wins - a[1].wins // More wins = higher rank
		}
		return b[1].differential - a[1].differential // Higher differential = higher rank
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
