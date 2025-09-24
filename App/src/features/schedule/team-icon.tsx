import { QueryDocumentSnapshot } from '@/firebase/firestore'
import { TeamDocument } from '@/shared/utils'
import { cn } from '@/shared/utils'
import { Link } from 'react-router-dom'

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

	return (
		<Link to={`/teams/${team.id}`}>
			{url ? (
				<img
					className={cn(
						'mx-auto w-8 h-8 rounded-full object-cover bg-muted hover:scale-105 transition duration-300'
					)}
					src={url}
				/>
			) : (
				<img
					className={cn(
						'mx-auto w-8 h-8 rounded-full object-cover bg-muted hover:scale-105 transition duration-300',
						'bg-linear-to-r from-primary to-sky-300'
					)}
				/>
			)}
		</Link>
	)
}
