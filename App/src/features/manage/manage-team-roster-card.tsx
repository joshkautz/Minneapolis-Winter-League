import { DocumentReference } from '@/firebase/firestore'
import { useTeamsContext } from '@/providers'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { NotificationCard } from '@/shared/components'
import { ManageTeamRosterPlayer } from './manage-team-roster-player'
import { PlayerDocument } from '@/shared/utils'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { useSeasonsContext } from '@/providers'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestamp } from '@/shared/utils'
import { useUserStatus } from '@/shared/hooks/use-user-status'

export const ManageTeamRosterCard = ({ actions }: { actions: ReactNode }) => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useTeamsContext()
	const {
		isLoading,
		isCaptain: isAuthenticatedUserCaptain,
		currentSeasonData,
	} = useUserStatus()

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	const registrationStatus =
		isLoading || currentSeasonTeamsQuerySnapshotLoading ? (
			<p className='text-sm text-muted-foreground'>Loading...</p>
		) : !team?.data().registered ? (
			<p className={'text-sm text-muted-foreground'}>
				You need 10 registered players in order to meet the minimum requirement.
				Registration ends on{' '}
				{formatTimestamp(
					currentSeasonQueryDocumentSnapshot?.data().registrationEnd
				)}
				.
			</p>
		) : (
			<p
				className={
					'text-sm text-muted-foreground inline-flex gap-2 items-center'
				}
			>
				{team?.data().name} is fully registered
				<CheckCircledIcon className='w-4 h-4' />
			</p>
		)

	const [imgLoaded, setImgLoaded] = useState(false)
	const [imgSrc, setImgSrc] = useState<string | undefined>()

	useEffect(() => {
		setImgSrc(team?.data()?.logo + `&date=${Date.now()}`)
	}, [team])

	const titleData = (
		<div className={'flex items-center gap-3'}>
			<div
				className={
					'relative h-12 w-12 rounded-full overflow-hidden bg-muted flex-shrink-0'
				}
			>
				{!imgLoaded && <Skeleton className='h-full w-full absolute inset-0' />}
				<img
					onError={() => {
						setImgLoaded(false)
					}}
					style={imgLoaded ? {} : { display: 'none' }}
					src={imgSrc}
					onLoad={() => {
						setImgLoaded(true)
					}}
					alt={`${team?.data().name} team logo`}
					className={'h-full w-full object-cover rounded-full'}
				/>
			</div>
			<div className='flex flex-col justify-center'>
				<h3 className='font-semibold text-lg leading-tight'>
					{team?.data().name}
				</h3>
				<p className='text-sm text-muted-foreground mt-1'>Team Roster</p>
			</div>
		</div>
	)

	return (
		<NotificationCard
			title={isLoading ? 'Loading...' : titleData}
			moreActions={actions}
			footerContent={
				isAuthenticatedUserCaptain ? registrationStatus : undefined
			}
		>
			<div className='space-y-0 -mx-1'>
				{team?.data().roster.map(
					(
						item: {
							captain: boolean
							player: DocumentReference<PlayerDocument>
						},
						index: number
					) => (
						<ManageTeamRosterPlayer
							key={`team-${index}`}
							playerRef={item.player}
						/>
					)
				)}
			</div>
		</NotificationCard>
	)
}
