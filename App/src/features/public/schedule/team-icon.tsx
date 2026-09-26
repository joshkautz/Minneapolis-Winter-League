import { type QueryDocumentSnapshot } from 'firebase/firestore'
import { TeamLogo } from '@/shared/components'
import { TeamSeasonDocument } from '@/types'

export const TeamIcon = ({
	team,
}: {
	team: QueryDocumentSnapshot<TeamSeasonDocument> | undefined
}) => {
	if (!team) {
		return (
			<div
				className={
					'shrink-0 w-8 h-8 bg-muted border-2 border-dashed border-muted-foreground rounded-full flex items-center justify-center'
				}
			>
				<span className={'text-xs text-muted-foreground font-bold'}>TBD</span>
			</div>
		)
	}

	return (
		<TeamLogo
			name={team.data().name}
			logo={team.data().logo}
			alt={team.data().name}
			className='h-8 w-8 shrink-0 rounded-full'
			initialClassName='text-xs'
		/>
	)
}
