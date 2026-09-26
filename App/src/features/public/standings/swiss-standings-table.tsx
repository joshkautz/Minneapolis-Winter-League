import { type QuerySnapshot } from 'firebase/firestore'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { TableHead } from '@/components/ui/table'
import { SwissTeamStanding, sortBySwissScore } from '@/shared/hooks'
import { TeamSeasonDocument } from '@/types'
import { SharedStandingsTable } from './shared-standings-table'

interface SwissStandingsTableProps {
	standings: Record<string, SwissTeamStanding>
	teamsQuerySnapshot: QuerySnapshot<TeamSeasonDocument> | undefined
}

/**
 * Standings for a Swiss-format season: the shared table, sorted by Swiss
 * score, with that score as its last column.
 */
export const SwissStandingsTable = ({
	standings,
	teamsQuerySnapshot,
}: SwissStandingsTableProps) => (
	<SharedStandingsTable
		data={standings}
		teamsQuerySnapshot={teamsQuerySnapshot}
		sortFunction={sortBySwissScore}
		rankColumnHeader='Rank'
		aria-label='Swiss standings showing team rankings with Buchholz scores'
		extraColumn={{
			header: (
				<TableHead className='w-20 text-center' scope='col'>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type='button'
								className='cursor-help font-medium'
								aria-label='Swiss Score'
							>
								Score
							</button>
						</TooltipTrigger>
						<TooltipContent>
							<p>
								Swiss Score: (Wins × 10) + Buchholz. Buchholz is the sum of your
								opponents' wins, rewarding teams with tougher schedules.
							</p>
						</TooltipContent>
					</Tooltip>
				</TableHead>
			),
			cell: (standing) => standing.swissScore,
		}}
	/>
)
