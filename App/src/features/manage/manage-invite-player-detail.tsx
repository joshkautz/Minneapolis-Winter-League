import {
	QueryDocumentSnapshot,
	offersForPlayerByTeamQuery,
} from '@/firebase/firestore'
import { cn } from '@/shared/utils'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Button } from '@/components/ui/button'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useTeamsContext } from '@/providers'
import { useMemo } from 'react'
import { useSeasonsContext } from '@/providers'
import { Mail } from 'lucide-react'

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

	const playerData = playerQueryDocumentSnapshot.data()
	const playerName = `${playerData.firstname} ${playerData.lastname}`
	const playerEmail = playerData.email
	const playerInitials =
		`${playerData.firstname[0]}${playerData.lastname[0]}`.toUpperCase()

	const isInviteDisabled = !offersForPlayerByTeamQuerySnapshot?.empty
	const inviteStatus = isInviteDisabled ? 'Already invited' : 'Send invite'

	return (
		<div className='border-b border-border/50 last:border-b-0'>
			<div className='flex items-center justify-between py-3 px-1 gap-3 hover:bg-muted/30 transition-colors duration-200 rounded-sm'>
				{/* Status indicator */}
				{statusColor && (
					<div className='flex-shrink-0'>
						<span
							className={cn('flex w-2 h-2 rounded-full', statusColor)}
							aria-hidden='true'
						/>
					</div>
				)}

				{/* Player info */}
				<div className='flex items-center gap-3 flex-1 min-w-0'>
					<Avatar className='h-8 w-8 flex-shrink-0'>
						<AvatarFallback className='bg-primary/10 text-primary text-sm font-medium'>
							{playerInitials}
						</AvatarFallback>
					</Avatar>
					<div className='min-w-0 flex-1 overflow-hidden'>
						<div className='flex items-center gap-2 min-w-0'>
							<p className='font-medium text-sm truncate max-w-[200px]'>
								{playerName}
							</p>
							{currentTeamQueryDocumentSnapshot && (
								<Badge
									variant='outline'
									className='text-xs px-1.5 py-0.5 flex-shrink-0 max-w-[100px]'
									title={`Currently on team: ${currentTeamQueryDocumentSnapshot.data().name}`}
								>
									<span className='truncate block'>
										{currentTeamQueryDocumentSnapshot.data().name}
									</span>
								</Badge>
							)}
						</div>
						<div className='flex items-center gap-1 text-xs text-muted-foreground min-w-0'>
							<Mail className='h-3 w-3 flex-shrink-0' />
							<span className='truncate block max-w-[250px]'>
								{playerEmail}
							</span>
						</div>
					</div>
				</div>

				{/* Invite button */}
				<div className='flex-shrink-0'>
					<Button
						disabled={isInviteDisabled}
						size='sm'
						variant={isInviteDisabled ? 'outline' : 'default'}
						className='text-xs font-medium min-w-[70px] sm:min-w-[80px]'
						onClick={() => {
							handleInvite(
								playerQueryDocumentSnapshot,
								teamQueryDocumentSnapshot
							)
						}}
						title={inviteStatus}
						aria-label={`${inviteStatus} for ${playerName}`}
					>
						{isInviteDisabled ? 'Invited' : 'Invite'}
					</Button>
				</div>
			</div>
		</div>
	)
}
