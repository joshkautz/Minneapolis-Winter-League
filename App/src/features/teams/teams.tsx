import { formatTimestamp } from '@/shared/utils'
import { ReloadIcon } from '@radix-ui/react-icons'
import { useTeamsContext } from '@/providers'
import { ComingSoon } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { Timestamp } from '@firebase/firestore'
import { useMemo } from 'react'
import { TeamCard } from './team-card'
import { Users } from 'lucide-react'

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
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Users className='h-8 w-8' />
					Teams
				</h1>
				<p className='text-muted-foreground'>
					Explore all the teams competing in this season
				</p>
			</div>

			{!selectedSeasonTeamsQuerySnapshot ? (
				<div
					className='flex items-center justify-center min-h-[400px]'
					role='status'
					aria-label='Loading teams'
				>
					<ReloadIcon className='mr-2 h-10 w-10 animate-spin' />
					<span className='sr-only'>Loading teams...</span>
				</div>
			) : selectedSeasonTeamsQuerySnapshot.docs.length === 0 ? (
				<ComingSoon>
					<p>{getEmptyStateMessage()}</p>
				</ComingSoon>
			) : (
				<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6'>
					{selectedSeasonTeamsQuerySnapshot.docs.map((team) => {
						const teamData = team.data()
						const teamId = team.id

						return (
							<TeamCard
								key={teamId}
								teamId={teamId}
								teamData={{
									name: teamData.name,
									logo: teamData.logo,
									registered: teamData.registered,
								}}
							/>
						)
					})}
				</div>
			)}
		</div>
	)
}
