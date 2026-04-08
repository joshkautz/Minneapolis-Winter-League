import { QueryDocumentSnapshot } from '@/firebase'
import { TeamSeasonDocument, cn } from '@/shared/utils'

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

	const url = team.data().logo
	const teamName = team.data().name
	const firstLetter = teamName?.charAt(0).toUpperCase() || '?'

	if (url) {
		return (
			<img
				className={cn(
					'shrink-0 w-8 h-8 rounded-full object-cover bg-muted transition duration-300'
				)}
				src={url}
				alt={teamName}
			/>
		)
	}

	return (
		<div
			className={cn(
				'shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center transition duration-300'
			)}
		>
			<span className='text-xs text-primary-foreground font-bold'>
				{firstLetter}
			</span>
		</div>
	)
}
