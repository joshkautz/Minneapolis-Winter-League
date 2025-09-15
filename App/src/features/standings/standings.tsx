import { ComingSoon } from '@/shared/components'
import { useTeamsContext } from '@/providers'
import { useGamesContext } from '@/providers'
import { ReloadIcon } from '@radix-ui/react-icons'
import { useStandings } from '@/shared/hooks'
import { StandingsTable } from './standings-table'
import { ResultsTable } from './results-table'
import { useSeasonsContext } from '@/providers'
import { formatTimestamp } from '@/shared/utils'
import { Trophy } from 'lucide-react'

export const Standings = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { regularSeasonGamesQuerySnapshot, playoffGamesQuerySnapshot } =
		useGamesContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const standings = useStandings(regularSeasonGamesQuerySnapshot)
	const results = useStandings(playoffGamesQuerySnapshot)

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Trophy className='h-8 w-8' />
					Standings
				</h1>
				<p className='text-muted-foreground'>
					Regular season and playoff results for all teams
				</p>
			</div>

			{!regularSeasonGamesQuerySnapshot ? (
				<div className='absolute inset-0 flex items-center justify-center'>
					<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
				</div>
			) : Object.keys(standings).length === 0 &&
			  Object.keys(results).length === 0 ? (
				<ComingSoon>
					<p>
						{`No standings yet exists for the season. Check back after games start on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.dateStart)}.`}
					</p>
				</ComingSoon>
			) : (
				<>
					{/* Regular Season Section */}
					{Object.keys(standings).length > 0 && (
						<div className='space-y-4'>
							<h2 className='text-xl font-semibold'>
								Weeks 1-5 (Regular Season)
							</h2>
							<StandingsTable
								standings={standings}
								teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
							/>
						</div>
					)}

					{/* Playoff Section */}
					{Object.keys(results).length > 0 && (
						<div className='space-y-4'>
							<h2 className='text-xl font-semibold'>Weeks 6-7 (Playoffs)</h2>
							<ResultsTable
								results={results}
								teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
							/>
						</div>
					)}
				</>
			)}
		</div>
	)
}
