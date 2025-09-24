import { QuerySnapshot } from '@/firebase/firestore'
import { TeamDocument } from '@/shared/utils'
import { TeamStanding } from '@/shared/hooks'
import { SharedStandingsTable } from './shared-standings-table'

export const StandingsTable = ({
	standings,
	teamsQuerySnapshot,
}: {
	standings: {
		[key: string]: TeamStanding
	}
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
}) => {
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
		<SharedStandingsTable
			data={standings}
			teamsQuerySnapshot={teamsQuerySnapshot}
			sortFunction={sortByWinsThenDiff}
			rankColumnHeader='Rank'
			useTeamPlacement={false}
			aria-label='Regular season standings showing team rankings, wins, losses, and point differential'
		/>
	)
}
