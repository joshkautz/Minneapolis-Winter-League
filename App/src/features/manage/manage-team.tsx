import { useMemo } from 'react'
import { useAuthContext } from '@/providers'
import { ManageTeamRequestCard } from './manage-team-request-card'
import { ManageInvitePlayerList } from './manage-invite-player-list'
import { useSeasonsContext } from '@/providers'
import { ManageTeamRosterCard } from './manage-team-roster-card'
import { ManageCaptainActions } from './manage-captain-actions'
import { ManageNonCaptainActions } from './manage-non-captain-actions'
import { ManageCaptainsOffersPanel } from './manage-captains-offers-panel'
import type { PlayerSeason } from '@/types'
import { ManageNonCaptainsOffersPanel } from './manage-non-captains-offers-panel'
import { Users } from 'lucide-react'

export const ManageTeam = () => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
	} = useAuthContext()

	const isLoading = useMemo(
		() =>
			(!authStateUser &&
				authStateLoading &&
				!authenticatedUserSnapshot &&
				authenticatedUserSnapshotLoading) ||
			(!authStateUser &&
				authStateLoading &&
				!authenticatedUserSnapshot &&
				!authenticatedUserSnapshotLoading) ||
			(authStateUser &&
				!authStateLoading &&
				!authenticatedUserSnapshot &&
				!authenticatedUserSnapshotLoading) ||
			(authStateUser &&
				!authStateLoading &&
				!authenticatedUserSnapshot &&
				authenticatedUserSnapshotLoading),
		[
			authStateUser,
			authStateLoading,
			authenticatedUserSnapshot,
			authenticatedUserSnapshotLoading,
		]
	)

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Users className='h-8 w-8' />
					{isLoading
						? `Loading...`
						: !isAuthenticatedUserRostered
							? `Join Team`
							: `Team Management`}
				</h1>
				<p className='text-muted-foreground'>
					{isLoading
						? `Loading team management...`
						: !isAuthenticatedUserRostered
							? `Find and join a team for the current season`
							: `Manage team roster, invitations, and settings`}
				</p>
			</div>

			<div className={'flex flex-row justify-center gap-8 flex-wrap-reverse'}>
				{/* LEFT SIDE PANEL */}
				<div className='max-w-[600px] flex-1 basis-80 space-y-4'>
					{isAuthenticatedUserRostered ? (
						<ManageTeamRosterCard
							actions={
								isAuthenticatedUserCaptain ? (
									<ManageCaptainActions />
								) : (
									<ManageNonCaptainActions />
								)
							}
						/>
					) : (
						<ManageTeamRequestCard />
					)}
					{isAuthenticatedUserCaptain && <ManageInvitePlayerList />}
				</div>
				{/* RIGHT SIDE PANEL */}
				{isAuthenticatedUserCaptain ? (
					<ManageCaptainsOffersPanel />
				) : (
					<ManageNonCaptainsOffersPanel />
				)}
			</div>
		</div>
	)
}
