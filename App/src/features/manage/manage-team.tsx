import { useMemo } from 'react'
import { useAuthContext } from '@/providers'
import { ManageTeamRequestCard } from './manage-team-request-card'
import { ManageInvitePlayerList } from './manage-invite-player-list'
import { GradientHeader } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { ManageTeamRosterCard } from './manage-team-roster-card'
import { ManageCaptainActions } from './manage-captain-actions'
import { ManageNonCaptainActions } from './manage-non-captain-actions'
import { ManageCaptainsOffersPanel } from './manage-captains-offers-panel'
import { ManageNonCaptainsOffersPanel } from './manage-non-captains-offers-panel'

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
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	return (
		<div className={'container'}>
			<GradientHeader>
				{isLoading
					? `Loading...`
					: !isAuthenticatedUserRostered
						? `Join Team`
						: isAuthenticatedUserCaptain
							? `Manage Team`
							: `Manage Player`}
			</GradientHeader>
			<div className={'flex flex-row justify-center gap-8 flex-wrap-reverse'}>
				{/* LEFT SIDE PANEL */}
				<div className="max-w-[600px] flex-1 basis-80 space-y-4">
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
