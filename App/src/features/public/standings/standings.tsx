import { Trophy } from 'lucide-react'
import {
	ComingSoon,
	LoadingSpinner,
	PageContainer,
	PageHeader,
} from '@/shared/components'
import {
	useTeamsContext,
	useGamesContext,
	useSeasonsContext,
} from '@/providers'
import { useStandings } from '@/shared/hooks'
import { StandingsTable } from './standings-table'
import { ResultsTable } from './results-table'
import { formatTimestamp } from '@/shared/utils'

export const Standings = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { regularSeasonGamesQuerySnapshot, playoffGamesQuerySnapshot } =
		useGamesContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const standings = useStandings(regularSeasonGamesQuerySnapshot)
	const results = useStandings(playoffGamesQuerySnapshot)

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Standings'
				description='Regular season and playoff results for all teams'
				icon={Trophy}
			/>

			{!regularSeasonGamesQuerySnapshot ? (
				<div className='absolute inset-0 flex items-center justify-center'>
					<LoadingSpinner size='lg' />
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
		</PageContainer>
	)
}
