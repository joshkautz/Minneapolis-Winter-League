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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
				<div className='flex items-center justify-center min-h-[400px]'>
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
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Trophy className='h-5 w-5' />
									Weeks 1-5 (Regular Season)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<StandingsTable
									standings={standings}
									teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
								/>
							</CardContent>
						</Card>
					)}

					{/* Playoff Section */}
					{Object.keys(results).length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Trophy className='h-5 w-5' />
									Weeks 6-7 (Playoffs)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ResultsTable
									results={results}
									teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
								/>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</PageContainer>
	)
}
