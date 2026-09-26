import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatPlacement } from '@/shared/utils'
import { TeamLogo } from './team-logo'

interface SeasonHistoryRowProps {
	/** The team-season page the row opens. */
	to: string
	teamName: string
	teamLogo: string | null
	seasonName: string
	wins: number
	losses: number
	placement: number | null
	/** Marks the row with a Captain badge, for a player's own history. */
	captain?: boolean
	className?: string
}

/**
 * One season of a team's history — logo, name, season, record and finish —
 * as the team profile and a player's ranking page both list it.
 */
export const SeasonHistoryRow = ({
	to,
	teamName,
	teamLogo,
	seasonName,
	wins,
	losses,
	placement,
	captain = false,
	className,
}: SeasonHistoryRowProps) => (
	<Link
		to={to}
		className={cn(
			'flex items-center gap-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
			className
		)}
		aria-label={`${teamName}, ${seasonName}, ${wins} wins ${losses} losses, finished ${formatPlacement(placement)}${captain ? ', Team Captain' : ''}`}
	>
		<TeamLogo
			name={teamName}
			logo={teamLogo}
			alt=''
			className='h-10 w-10 flex-shrink-0 rounded-full'
			initialClassName='text-sm'
		/>

		<div className='flex-1 min-w-0'>
			<div className='flex items-center gap-2'>
				<span className='font-medium text-foreground truncate'>{teamName}</span>
				{captain && (
					<Badge
						variant='secondary'
						className='flex items-center gap-1 shrink-0'
					>
						<Shield className='h-3 w-3' />
						<span className='sr-only sm:not-sr-only'>Captain</span>
					</Badge>
				)}
			</div>
			<span className='text-sm text-muted-foreground'>{seasonName}</span>
		</div>

		<div className='flex-shrink-0 text-center'>
			<div className='text-sm font-medium'>
				{wins}-{losses}
			</div>
			<div className='text-xs text-muted-foreground'>Record</div>
		</div>

		<div className='flex-shrink-0 text-right min-w-[60px]'>
			<div className='text-sm font-medium'>{formatPlacement(placement)}</div>
			<div className='text-xs text-muted-foreground'>Finish</div>
		</div>
	</Link>
)
