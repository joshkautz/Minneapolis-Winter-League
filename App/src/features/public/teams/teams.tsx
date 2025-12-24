import { useMemo, useState, useEffect } from 'react'
import { getDoc } from 'firebase/firestore'
import { Timestamp } from '@firebase/firestore'
import { Users, Sparkles } from 'lucide-react'
import { formatTimestamp } from '@/shared/utils'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import {
	ComingSoon,
	LoadingSpinner,
	PageContainer,
	PageHeader,
} from '@/shared/components'
import { TeamCard } from './team-card'
import { PlayerDocument } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Types for better TypeScript support
enum SeasonStatus {
	FUTURE = 'FUTURE',
	CURRENT = 'CURRENT',
	PAST = 'PAST',
}

export const Teams = () => {
	const { selectedSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const seasonStatus = useMemo((): SeasonStatus => {
		if (!selectedSeasonQueryDocumentSnapshot) {
			return SeasonStatus.PAST
		}

		const seasonData = selectedSeasonQueryDocumentSnapshot.data()
		const now = Timestamp.now().seconds
		const registrationStart = seasonData.registrationStart.seconds
		const registrationEnd = seasonData.registrationEnd.seconds

		if (registrationStart > now) {
			return SeasonStatus.FUTURE
		}
		if (registrationEnd > now) {
			return SeasonStatus.CURRENT
		}
		return SeasonStatus.PAST
	}, [selectedSeasonQueryDocumentSnapshot])

	// State to store registered player counts for each team
	const [registeredPlayerCounts, setRegisteredPlayerCounts] = useState<
		Map<string, number>
	>(new Map())

	// Calculate team placements based on registration date
	const teamsWithPlacements = useMemo(() => {
		if (!selectedSeasonTeamsQuerySnapshot) {
			return []
		}

		// Get all registered teams with their registration dates
		const registeredTeams = selectedSeasonTeamsQuerySnapshot.docs
			.map((team) => {
				const teamData = team.data()
				return {
					id: team.id,
					data: teamData,
					registeredDate: teamData.registered ? teamData.registeredDate : null,
				}
			})
			.filter((team) => team.registeredDate !== null)

		// Sort by registration date (oldest first)
		registeredTeams.sort((a, b) => {
			const aSeconds = a.registeredDate?.seconds || 0
			const bSeconds = b.registeredDate?.seconds || 0
			return aSeconds - bSeconds
		})

		// Create a map of team ID to placement
		const placementMap = new Map<string, number>()
		registeredTeams.forEach((team, index) => {
			placementMap.set(team.id, index + 1)
		})

		// Map all teams with their placements
		return selectedSeasonTeamsQuerySnapshot.docs.map((team) => {
			const teamData = team.data()
			return {
				id: team.id,
				data: teamData,
				placement: placementMap.get(team.id),
			}
		})
	}, [selectedSeasonTeamsQuerySnapshot])

	// Count registered players for each team
	useEffect(() => {
		if (
			!selectedSeasonTeamsQuerySnapshot ||
			!selectedSeasonQueryDocumentSnapshot
		) {
			return
		}

		const seasonId = selectedSeasonQueryDocumentSnapshot.id
		const counts = new Map<string, number>()

		const countRegisteredPlayers = async () => {
			const promises = selectedSeasonTeamsQuerySnapshot.docs.map(
				async (teamDoc) => {
					const teamData = teamDoc.data()
					const roster = teamData.roster || []

					// Fetch all player documents
					const playerDocs = await Promise.all(
						roster.map((rosterEntry) => getDoc(rosterEntry.player))
					)

					// Count players who are registered (paid and signed for this season)
					const registeredCount = playerDocs.filter((playerDoc) => {
						if (!playerDoc.exists()) return false

						const playerData = playerDoc.data() as PlayerDocument
						const playerSeason = playerData.seasons?.find(
							(s) => s.season.id === seasonId
						)

						return playerSeason?.paid === true && playerSeason?.signed === true
					}).length

					counts.set(teamDoc.id, registeredCount)
				}
			)

			await Promise.all(promises)
			setRegisteredPlayerCounts(new Map(counts))
		}

		countRegisteredPlayers()
	}, [selectedSeasonTeamsQuerySnapshot, selectedSeasonQueryDocumentSnapshot])

	const getEmptyStateMessage = (): string => {
		switch (seasonStatus) {
			case SeasonStatus.PAST:
				return 'There are no teams to display.'
			case SeasonStatus.FUTURE:
				return `Registration for this season will go live on ${formatTimestamp(
					selectedSeasonQueryDocumentSnapshot?.data()?.registrationStart
				)}!`
			case SeasonStatus.CURRENT:
				return 'Registration for this season is currently live. Create a new team or join an existing team!'
			default:
				return 'No teams available.'
		}
	}

	return (
		<PageContainer>
			<PageHeader
				title='Teams'
				description='Explore all the teams competing in this season'
				icon={Users}
				showSeasonIndicator
			/>

			{!selectedSeasonTeamsQuerySnapshot ? (
				<div
					className='flex items-center justify-center min-h-[400px]'
					role='status'
					aria-label='Loading teams'
				>
					<LoadingSpinner size='lg' label='Loading teams...' />
				</div>
			) : selectedSeasonTeamsQuerySnapshot.docs.length === 0 ? (
				<ComingSoon>
					<p>{getEmptyStateMessage()}</p>
				</ComingSoon>
			) : (
				<>
					<Alert className='mt-6'>
						<Sparkles className='h-5 w-5' />
						<AlertTitle>Experimental Features Now Live!</AlertTitle>
						<AlertDescription>
							The Karma system is now live in an experimental state. Help your
							fellow players find teams to earn karma points, and unlock future
							badges from now through the end of the season! Badges will be
							visible on individual team pages.
						</AlertDescription>
					</Alert>
					<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6'>
						{teamsWithPlacements.map((team) => {
							const registeredCount = registeredPlayerCounts.get(team.id) || 0
							return (
								<TeamCard
									key={team.id}
									teamId={team.id}
									teamData={{
										name: team.data.name,
										logo: team.data.logo,
										registered: team.data.registered,
										registeredDate: team.data.registeredDate,
										rosterCount: registeredCount,
										karma: team.data.karma || 0,
									}}
									placement={team.placement}
								/>
							)
						})}
					</div>
				</>
			)}
		</PageContainer>
	)
}
