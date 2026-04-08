import { ReactNode, useMemo, useState } from 'react'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { useCollection } from 'react-firebase-hooks/firestore'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import { NotificationCard } from '@/shared/components'
import { ManageTeamRosterPlayer } from './manage-team-roster-player'
import { formatTimestamp, TeamRosterDocument } from '@/shared/utils'
import { useUserStatus } from '@/shared/hooks/use-user-status'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	teamRosterSubcollection,
} from '@/firebase/collections/teams'

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
				(teamDoc) =>
					canonicalTeamIdFromTeamSeasonDoc(teamDoc) ===
					currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	// Roster subcollection for the captain's team in the current season.
	const canonicalTeamId = team
		? canonicalTeamIdFromTeamSeasonDoc(team)
		: undefined
	const seasonId = currentSeasonQueryDocumentSnapshot?.id
	const [rosterSnapshot] = useCollection(
		canonicalTeamId && seasonId
			? teamRosterSubcollection(canonicalTeamId, seasonId)
			: undefined
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

	const [imageError, setImageError] = useState(false)

	const titleData = (
		<div className={'flex items-center gap-3'}>
			<div
				className={
					'relative h-12 w-12 rounded-full overflow-hidden bg-muted flex-shrink-0'
				}
			>
				{team?.data()?.logo && !imageError ? (
					<img
						src={team.data().logo || undefined}
						alt={`${team.data().name} team logo`}
						className={'h-full w-full object-cover rounded-full'}
						onError={() => setImageError(true)}
					/>
				) : (
					<div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-sky-300'>
						<span className='text-sm font-bold text-primary-foreground'>
							{team?.data()?.name?.charAt(0)?.toUpperCase() || 'T'}
						</span>
					</div>
				)}
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
			className='max-w-none'
		>
			<div className='space-y-0 -mx-1'>
				{rosterSnapshot?.docs.map((rosterDoc) => {
					const data = rosterDoc.data() as TeamRosterDocument
					return (
						<ManageTeamRosterPlayer
							key={rosterDoc.id}
							playerRef={data.player}
						/>
					)
				})}
			</div>
		</NotificationCard>
	)
}
