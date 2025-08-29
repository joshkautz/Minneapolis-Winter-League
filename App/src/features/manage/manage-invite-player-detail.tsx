import {
	QueryDocumentSnapshot,
	offersForPlayerByTeamQuery,
} from '@/firebase/firestore'
import { cn } from '@/shared/utils'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Button } from '@/components/ui/button'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { Badge } from '@/components/ui/badge'
import { useTeamsContext } from '@/providers'
import { useMemo } from 'react'
import { useSeasonsContext } from '@/providers'

export const ManageInvitePlayerDetail = ({
	teamQueryDocumentSnapshot,
	playerQueryDocumentSnapshot,
	statusColor,
	handleInvite,
}: {
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument> | undefined
	playerQueryDocumentSnapshot: QueryDocumentSnapshot<PlayerDocument>
	statusColor?: string
	message?: string
	handleInvite: (
		playerQueryDocumentSnapshot: QueryDocumentSnapshot<PlayerDocument>,
		teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument> | undefined
	) => void
}) => {
	const [offersForPlayerByTeamQuerySnapshot] = useCollection(
		offersForPlayerByTeamQuery(
			playerQueryDocumentSnapshot,
			teamQueryDocumentSnapshot
		)
	)
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const currentTeamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					playerQueryDocumentSnapshot
						?.data()
						?.seasons.find(
							(item) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonQueryDocumentSnapshot]
	)

	return (
		<div className='flex items-end gap-2 py-2'>
			{statusColor && (
				<span
					className={cn(
						'flex shrink-0 content-center self-start w-2 h-2 mt-2 mr-2 translate-y-1 rounded-full',
						statusColor
					)}
				/>
			)}
			<div className='mr-2'>
				<p>{`${playerQueryDocumentSnapshot.data().firstname} ${playerQueryDocumentSnapshot.data().lastname}`}</p>
				<p className='overflow-hidden text-sm max-h-5 text-muted-foreground'>
					{`${playerQueryDocumentSnapshot.data().email}`}
				</p>
			</div>
			{currentTeamQueryDocumentSnapshot && (
				<div>
					<Badge variant={'outline'}>
						{currentTeamQueryDocumentSnapshot.data().name}
					</Badge>
				</div>
			)}
			<div className='flex justify-end flex-1 gap-2'>
				<Button
					disabled={!offersForPlayerByTeamQuerySnapshot?.empty}
					size={'sm'}
					variant={'outline'}
					onClick={() => {
						handleInvite(playerQueryDocumentSnapshot, teamQueryDocumentSnapshot)
					}}
				>
					Invite
				</Button>
			</div>
		</div>
	)
}
