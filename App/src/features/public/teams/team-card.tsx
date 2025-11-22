import { Link } from 'react-router-dom'
import { cn, formatTimestampWithTime } from '@/shared/utils'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

// Types for better TypeScript support
interface TeamCardProps {
	teamId: string
	teamData: {
		name: string
		logo?: string | null
		registered: boolean
		registeredDate?: any // Timestamp
		rosterCount?: number // Number of players on roster
		karma?: number // Team karma points
	}
	placement?: number // Placement number for registered teams
}

// Helper function to get ordinal suffix
const getOrdinalSuffix = (num: number): string => {
	const j = num % 10
	const k = num % 100
	if (j === 1 && k !== 11) {
		return num + 'st'
	}
	if (j === 2 && k !== 12) {
		return num + 'nd'
	}
	if (j === 3 && k !== 13) {
		return num + 'rd'
	}
	return num + 'th'
}

// Team Card Component
export const TeamCard = ({ teamId, teamData, placement }: TeamCardProps) => {
	const {
		name,
		logo,
		registered,
		registeredDate,
		rosterCount = 0,
		karma = 0,
	} = teamData
	const MIN_PLAYERS_REQUIRED = 10
	const progressPercentage = Math.min(
		(rosterCount / MIN_PLAYERS_REQUIRED) * 100,
		100
	)

	return (
		<Link
			to={`/teams/${teamId}`}
			className='group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg'
			aria-label={`View details for team ${name}`}
		>
			<Card className='h-full transition-all duration-300 hover:shadow-lg group-hover:shadow-xl py-0'>
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
					<div className='mx-auto text-center w-full px-2'>
						{!registered ? (
							<div className='flex flex-col gap-2'>
								<span className='text-sm text-muted-foreground'>
									{rosterCount}/{MIN_PLAYERS_REQUIRED} players
								</span>
								<Progress value={progressPercentage} className='h-2' />
							</div>
						) : (
							<div className='flex flex-col items-center gap-2'>
								<div className='text-sm text-green-600 dark:text-green-500'>
									<span>
										Registered {placement && `- ${getOrdinalSuffix(placement)}`}
									</span>
								</div>
								{placement && registeredDate && (
									<div className='text-xs text-muted-foreground'>
										{formatTimestampWithTime(registeredDate)}
									</div>
								)}
								{karma > 0 && (
									<Badge
										variant='outline'
										className='text-xs font-normal border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
									>
										<Sparkles className='h-3 w-3 mr-1' />
										{karma} Karma
									</Badge>
								)}
							</div>
						)}
					</div>
				</CardFooter>
			</Card>
		</Link>
	)
}
