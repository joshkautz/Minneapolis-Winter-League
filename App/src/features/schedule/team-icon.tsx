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
			<div
				className={'w-10 h-10 bg-secondary animate-pulse mx-auto rounded-full'}
			/>
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
