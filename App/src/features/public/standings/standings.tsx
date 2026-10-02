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
import { useStandings, useSwissStandings } from '@/shared/hooks'
import { StandingsTable } from './standings-table'
import { SwissStandingsTable } from './swiss-standings-table'
import { ResultsTable } from './results-table'
import { formatTimestamp } from '@/shared/utils'
import { SeasonFormat } from '@/types'
import {
	nightsIn,
	standingsRanks,
	weeksLabel,
	withRankedTeams,
} from './standings-order'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const Standings = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { regularSeasonGamesQuerySnapshot, playoffGamesQuerySnapshot } =
		useGamesContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	// Check if this is a Swiss-format season
	const seasonData = selectedSeasonQueryDocumentSnapshot?.data()
	const isSwissFormat = seasonData?.format === SeasonFormat.SWISS

	// Use appropriate standings hook based on format
	const ranks = standingsRanks(selectedSeasonTeamsQuerySnapshot)
	const playedStandings = useStandings(regularSeasonGamesQuerySnapshot)
	// A generated season lists every team from before its first game.
	const traditionalStandings = withRankedTeams(playedStandings, ranks)
	const noGamesPlayed = Object.keys(playedStandings).length === 0
	const regularNights = nightsIn(regularSeasonGamesQuerySnapshot)
	const playoffNights = nightsIn(playoffGamesQuerySnapshot)
	const swissStandings = useSwissStandings(regularSeasonGamesQuerySnapshot)
	const results = useStandings(playoffGamesQuerySnapshot)

	// Choose which standings to display
	const hasStandings = isSwissFormat
		? Object.keys(swissStandings).length > 0
		: Object.keys(traditionalStandings).length > 0

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Standings'
				description='Regular season and playoff results for all teams'
				icon={Trophy}
				showSeasonIndicator
			/>

			{!regularSeasonGamesQuerySnapshot ? (
				<div className='flex items-center justify-center min-h-[400px]'>
					<LoadingSpinner size='lg' />
				</div>
			) : !hasStandings && Object.keys(results).length === 0 ? (
				<ComingSoon>
					<p>
						{`No standings yet for this season. Check back after games start on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.dateStart)}.`}
					</p>
				</ComingSoon>
			) : (
				<>
					{/* Regular Season Section */}
					{hasStandings && (
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Trophy className='h-5 w-5' />
									{weeksLabel(1, regularNights)} (Regular Season)
									{isSwissFormat && (
										<Badge variant='outline' className='ml-2'>
											Swiss Format
										</Badge>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{isSwissFormat ? (
									<SwissStandingsTable
										standings={swissStandings}
										teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
									/>
								) : (
									<>
										{noGamesPlayed && ranks.size > 0 && (
											<p className='text-sm text-muted-foreground mb-4'>
												No games played yet: teams are ordered by their
												players&apos; average rating, a player new to the league
												counting at the starting rating.
											</p>
										)}
										<StandingsTable
											standings={traditionalStandings}
											ranks={ranks}
											teamsQuerySnapshot={selectedSeasonTeamsQuerySnapshot}
										/>
									</>
								)}
							</CardContent>
						</Card>
					)}

					{/* Playoff Section */}
					{Object.keys(results).length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Trophy className='h-5 w-5' />
									{weeksLabel(regularNights + 1, playoffNights)} (Playoffs)
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
