import { type QuerySnapshot } from 'firebase/firestore'
import { TeamSeasonDocument } from '@/types'
import { TeamStanding } from '@/shared/hooks'
import { SharedStandingsTable } from './shared-standings-table'
import { byStandings } from './standings-order'

export const StandingsTable = ({
	standings,
	ranks,
	teamsQuerySnapshot,
}: {
	standings: {
		[key: string]: TeamStanding
	}
	/** Each team's `standingsRank`, which orders a generated season. */
	ranks: ReadonlyMap<string, number>
	teamsQuerySnapshot: QuerySnapshot<TeamSeasonDocument> | undefined
}) => (
	<SharedStandingsTable
		data={standings}
		teamsQuerySnapshot={teamsQuerySnapshot}
		sortFunction={byStandings(ranks)}
		rankColumnHeader='Rank'
		useTeamPlacement={false}
		aria-label='Regular season standings showing team rankings, wins, losses, and point differential'
	/>
)
