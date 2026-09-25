import { Users as UsersIcon } from 'lucide-react'
import { useRosterSize } from './use-roster-size'

/** A team-season's roster size, for a table cell. */
export const RosterSize = ({
	teamId,
	seasonId,
}: {
	teamId: string
	seasonId: string
}) => {
	const size = useRosterSize(teamId, seasonId)
	return (
		<div className='flex items-center gap-2'>
			<UsersIcon className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
			<span>{size ?? '—'}</span>
		</div>
	)
}
