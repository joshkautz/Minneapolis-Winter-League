import { GradientHeader } from '@/shared/components'
import { ComingSoon } from '@/shared/components'
import { useTeamsContext } from '@/providers'
import { useGamesContext } from '@/providers'
import { ReloadIcon } from '@radix-ui/react-icons'
import { useStandings } from '@/shared/hooks'
import { StandingsTable } from './standings-table'
import { ResultsTable } from './results-table'
import { useSeasonsContext } from '@/providers'
import { formatTimestamp } from '@/shared/utils'

export const Standings = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { regularSeasonGamesQuerySnapshot, playoffGamesQuerySnapshot } =
		useGamesContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const standings = useStandings(regularSeasonGamesQuerySnapshot)
	const results = useStandings(playoffGamesQuerySnapshot)

	return (
		<div className='container'>
			<GradientHeader>Weeks 1-5 (Regular)</GradientHeader>
			{!regularSeasonGamesQuerySnapshot ? (
				<div className='absolute inset-0 flex items-center justify-center'>
					<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
				</div>
			) : Object.keys(standings).length === 0 ? (
				<ComingSoon>
					<p className={' pt-6 '}>
						{`There are no standings to display. Please wait for games to start on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.dateStart)}.`}
					</p>
				</ComingSoon>
			) : (
				<>
					<StandingsTable
						standings={standings}
						teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
					/>
					<GradientHeader>Weeks 6-7 (Playoffs)</GradientHeader>
					<ResultsTable
						results={results}
						teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
					/>
				</>
			)}
		</div>
	)
}
