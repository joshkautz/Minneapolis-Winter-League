import { Link } from 'react-router-dom'
import { QueryDocumentSnapshot } from '@/firebase'
import { TeamDocument, cn } from '@/shared/utils'

export const TeamIcon = ({
	team,
}: {
	team: QueryDocumentSnapshot<TeamDocument> | undefined
}) => {
	if (!team) {
		return (
			<div className={'flex flex-col items-center gap-1'}>
				<div
					className={
						'w-8 h-8 bg-muted border-2 border-dashed border-muted-foreground mx-auto rounded-full flex items-center justify-center'
					}
				>
					<span className={'text-xs text-muted-foreground font-bold'}>TBD</span>
				</div>
			</div>
		)
	}

	const url = team.data().logo
	const teamName = team.data().name
	const firstLetter = teamName?.charAt(0).toUpperCase() || '?'

	return (
		<Link to={`/teams/${team.id}`}>
			{url ? (
				<img
					className={cn(
						'mx-auto w-8 h-8 rounded-full object-cover bg-muted hover:scale-105 transition duration-300'
					)}
					src={url}
					alt={teamName}
				/>
			) : (
				<div
					className={cn(
						'mx-auto w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:scale-105 transition duration-300'
					)}
				>
					<span className='text-xs text-primary-foreground font-bold'>
						{firstLetter}
					</span>
				</div>
			)}
		</Link>
	)
}
