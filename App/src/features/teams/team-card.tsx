import { Link } from 'react-router-dom'
import { cn } from '@/shared/utils'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

// Types for better TypeScript support
interface TeamCardProps {
	teamId: string
	teamData: {
		name: string
		logo?: string | null
		registered: boolean
	}
}

// Team Card Component
export const TeamCard = ({ teamId, teamData }: TeamCardProps) => {
	const { name, logo, registered } = teamData

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
