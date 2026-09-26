import { Link } from 'react-router-dom'
import {
	formatTimestampWithTime,
	MIN_SIGNED_PLAYERS,
	ordinal,
} from '@/shared/utils'
import { TeamLogo } from '@/shared/components'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Timestamp } from 'firebase/firestore'

// Types for better TypeScript support
interface TeamCardProps {
	teamId: string
	/**
	 * Optional season id to embed in the link target. When provided, the
	 * card links to `/teams/{teamId}/{seasonId}` so the user's currently-
	 * selected season survives the navigation. Without this the bare
	 * `/teams/{teamId}` route always renders the team's current-season
	 * subdoc, which is wrong if the user was browsing a past season.
	 */
	seasonId?: string
	teamData: {
		name: string
		logo?: string | null
		registered: boolean
		registeredDate?: Timestamp
		rosterCount?: number // Number of players on roster
	}
	placement?: number // Placement number for registered teams
}

// Team Card Component
export const TeamCard = ({
	teamId,
	seasonId,
	teamData,
	placement,
}: TeamCardProps) => {
	const { name, logo, registered, registeredDate, rosterCount = 0 } = teamData
	const progressPercentage = Math.min(
		(rosterCount / MIN_SIGNED_PLAYERS) * 100,
		100
	)
	const linkTo = seasonId ? `/teams/${teamId}/${seasonId}` : `/teams/${teamId}`

	return (
		<Link
			to={linkTo}
			className='group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg'
			aria-label={`View details for team ${name}`}
		>
			<Card className='h-full transition-all duration-300 hover:shadow-lg group-hover:shadow-xl py-0'>
				<CardHeader className='p-0'>
					<TeamLogo
						name={name}
						logo={logo}
						alt={`${name} team logo`}
						loading='lazy'
						className='aspect-square w-full rounded-t-lg'
						imageClassName='transition-transform duration-300 group-hover:scale-105'
						initialClassName='text-2xl'
					/>
				</CardHeader>

				<CardContent className='flex flex-col items-center justify-center p-4'>
					<h3 className='text-center font-semibold leading-tight overflow-hidden text-ellipsis line-clamp-2 max-h-12'>
						{name}
					</h3>
					<div className='mt-2 h-0.5 w-0 bg-primary transition-all duration-500 group-hover:w-full' />
				</CardContent>

				<CardFooter className='pt-0 pb-4'>
					<div className='mx-auto text-center w-full px-2'>
						{!registered ? (
							<div className='flex flex-col gap-2'>
								<span className='text-sm text-muted-foreground'>
									{rosterCount}/{MIN_SIGNED_PLAYERS} players
								</span>
								<Progress value={progressPercentage} className='h-2' />
							</div>
						) : (
							<div className='flex flex-col items-center gap-2'>
								<div className='text-sm text-green-600 dark:text-green-500'>
									<span>
										Registered {placement && `- ${ordinal(placement)}`}
									</span>
								</div>
								{placement && registeredDate && (
									<div className='text-xs text-muted-foreground'>
										{formatTimestampWithTime(registeredDate)}
									</div>
								)}
							</div>
						)}
					</div>
				</CardFooter>
			</Card>
		</Link>
	)
}
