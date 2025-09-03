import { Link } from 'react-router-dom'
import { cn, formatTimestamp } from '@/shared/utils'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useTeamsContext } from '@/providers'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { GradientHeader } from '@/shared/components'
import { ComingSoon } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { Timestamp } from '@firebase/firestore'
import { useMemo } from 'react'

// Types for better TypeScript support
enum SeasonStatus {
	FUTURE = 'FUTURE',
	CURRENT = 'CURRENT',
	PAST = 'PAST',
}

interface TeamCardProps {
	teamId: string
	teamData: {
		name: string
		logo?: string | null
		registered: boolean
	}
}

// Team Card Component
const TeamCard = ({ teamId, teamData }: TeamCardProps) => {
	const { name, logo, registered } = teamData

	return (
		<Link
			to={`/teams/${teamId}`}
			className='group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg'
			aria-label={`View details for team ${name}`}
		>
			<Card className='h-full transition-all duration-300 hover:shadow-lg group-hover:shadow-xl'>
				<CardHeader className='p-0'>
					<div className='aspect-square w-full overflow-hidden rounded-t-lg bg-muted'>
						{logo ? (
							<img
								src={logo}
								alt={`${name} team logo`}
								className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
								loading='lazy'
								onError={(e) => {
									const target = e.target as HTMLImageElement
									target.style.display = 'none'
									const parent = target.parentElement
									if (parent) {
										parent.className = cn(
											parent.className,
											'bg-gradient-to-br from-primary to-sky-300 flex items-center justify-center'
										)
										parent.innerHTML = `<span class="text-primary-foreground font-semibold text-lg">${name.charAt(0).toUpperCase()}</span>`
									}
								}}
							/>
						) : (
							<div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-sky-300'>
								<span className='text-2xl font-bold text-primary-foreground'>
									{name.charAt(0).toUpperCase()}
								</span>
							</div>
						)}
					</div>
				</CardHeader>

				<CardContent className='flex flex-col items-center justify-center p-4'>
					<h3 className='text-center font-semibold leading-tight overflow-hidden text-ellipsis line-clamp-2 max-h-12'>
						{name}
					</h3>
					<div className='mt-2 h-0.5 w-0 bg-primary transition-all duration-500 group-hover:w-full' />
				</CardContent>

				<CardFooter className='pt-0 pb-4'>
					<div className='mx-auto text-center'>
						{!registered ? (
							<span className='text-sm text-muted-foreground italic'>
								Registration in progress
							</span>
						) : (
							<div className='inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-500'>
								<span>Registered</span>
								<CheckCircledIcon className='h-4 w-4' />
							</div>
						)}
					</div>
				</CardFooter>
			</Card>
		</Link>
	)
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
		<div className='container mx-auto px-4 py-8'>
			<GradientHeader>Teams</GradientHeader>

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
					<p className='pt-6 text-center max-w-2xl'>{getEmptyStateMessage()}</p>
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
