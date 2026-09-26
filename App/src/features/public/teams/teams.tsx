import { useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useCollection } from 'react-firebase-hooks/firestore'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { Users } from 'lucide-react'
import { formatTimestamp, registeredPlayersByTeam } from '@/shared/utils'
import { useQueryErrorHandler } from '@/shared/hooks'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import {
	ComingSoon,
	LoadingSpinner,
	PageContainer,
	PageHeader,
} from '@/shared/components'
import { TeamCard } from './team-card'
import { playerSeasonsInSeasonQuery } from '@/firebase/collections/players'

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

	// Every player-season in the season, live, so a team's count moves as
	// its players sign. Who counts depends on the season's pricing, which a
	// query cannot express: under team payments signing is enough.
	const [playerSeasonsSnapshot, , playerSeasonsError] = useCollection(
		playerSeasonsInSeasonQuery(selectedSeasonQueryDocumentSnapshot?.ref)
	)
	useQueryErrorHandler({
		error: playerSeasonsError,
		component: 'Teams',
		errorLabel: 'registered players',
	})
	const registeredPlayerCounts = useMemo(
		() =>
			registeredPlayersByTeam(
				playerSeasonsSnapshot?.docs.map((doc) => doc.data()) ?? [],
				selectedSeasonQueryDocumentSnapshot?.data()
			),
		[playerSeasonsSnapshot, selectedSeasonQueryDocumentSnapshot]
	)

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
					id: canonicalTeamIdFromTeamSeasonDoc(team),
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
			const canonicalId = canonicalTeamIdFromTeamSeasonDoc(team)
			return {
				id: canonicalId,
				data: teamData,
				placement: placementMap.get(canonicalId),
			}
		})
	}, [selectedSeasonTeamsQuerySnapshot])

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
					<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mt-6'>
						{teamsWithPlacements.map((team) => {
							const registeredCount = registeredPlayerCounts.get(team.id) || 0
							return (
								<TeamCard
									key={team.id}
									teamId={team.id}
									seasonId={selectedSeasonQueryDocumentSnapshot?.id}
									teamData={{
										name: team.data.name,
										logo: team.data.logo,
										registered: team.data.registered,
										registeredDate: team.data.registeredDate ?? undefined,
										rosterCount: registeredCount,
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
