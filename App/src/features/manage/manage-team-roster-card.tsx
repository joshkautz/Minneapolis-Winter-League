import { DocumentData, DocumentReference } from '@/firebase/firestore'
import { useTeamsContext } from '@/providers'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { NotificationCard } from '@/shared/components'
import { ManageTeamRosterPlayer } from './manage-team-roster-player'
import { useAuthContext } from '@/providers'
import { PlayerData } from '@/shared/utils'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { useSeasonsContext } from '@/providers'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestamp } from '@/shared/utils'

export const ManageTeamRosterCard = ({ actions }: { actions: ReactNode }) => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useTeamsContext()
	const {
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		authStateLoading,
	} = useAuthContext()

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					authenticatedUserSnapshot
						?.data()
						?.seasons.find(
							(item) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[
			authenticatedUserSnapshot,
			currentSeasonTeamsQuerySnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const registrationStatus =
		authenticatedUserSnapshotLoading ||
		currentSeasonTeamsQuerySnapshotLoading ? (
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
		<div className={'inline-flex items-center gap-2 h-4'}>
			<p>{team?.data().name}</p>
			<div className={'h-8 w-8 rounded-full overflow-hidden'}>
				{!imgLoaded && <Skeleton className='h-[100px] md:h-[250px] md:w-1/4' />}
				<img
					onError={() => {
						setImgLoaded(false)
					}}
					style={imgLoaded ? {} : { display: 'none' }}
					src={imgSrc}
					onLoad={() => {
						setImgLoaded(true)
					}}
					alt={'team logo'}
					className={'rounded-md object-cover'}
				/>
			</div>
		</div>
	)

	return (
		<NotificationCard
			title={
				authenticatedUserSnapshotLoading || authStateLoading
					? 'Loading...'
					: titleData
			}
			description={'Your team roster'}
			moreActions={actions}
			footerContent={
				isAuthenticatedUserCaptain ? registrationStatus : undefined
			}
		>
			{team?.data().roster.map(
				(
					item: {
						captain: boolean
						player: DocumentReference<PlayerData, DocumentData>
					},
					index: number
				) => (
					<ManageTeamRosterPlayer
						key={`team-${index}`}
						playerRef={item.player}
					/>
				)
			)}
		</NotificationCard>
	)
}
