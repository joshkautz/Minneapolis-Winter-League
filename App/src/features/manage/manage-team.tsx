import { useMemo, useState } from 'react'
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
import { Users, UserPlus } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CreateTeam } from '@/features/create/create-team'

export const ManageTeam = () => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const [activeTab, setActiveTab] = useState('join')

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

	// If user is already rostered, show team management without tabs
	if (isAuthenticatedUserRostered) {
		return (
			<div className='container mx-auto px-4 py-8 space-y-6'>
				{/* Header */}
				<div className='text-center space-y-4'>
					<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
						<Users className='h-8 w-8' />
						{isLoading ? `Loading...` : `Team Management`}
					</h1>
					<p className='text-muted-foreground'>
						{isLoading
							? `Loading team management...`
							: `Manage team roster, invitations, and settings`}
					</p>
				</div>

				<div className={'flex flex-row justify-center gap-8 flex-wrap-reverse'}>
					{/* LEFT SIDE PANEL */}
					<div className='max-w-[600px] flex-1 basis-80 space-y-4'>
						<ManageTeamRosterCard
							actions={
								isAuthenticatedUserCaptain ? (
									<ManageCaptainActions />
								) : (
									<ManageNonCaptainActions />
								)
							}
						/>
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

	// If user is not rostered, show tabs for joining or creating a team
	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Users className='h-8 w-8' />
					{isLoading ? `Loading...` : `Team Options`}
				</h1>
				<p className='text-muted-foreground'>
					{isLoading
						? `Loading team options...`
						: `Join an existing team or create a new one for the current season`}
				</p>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
				<div className='flex justify-center'>
					<TabsList className='grid w-fit grid-cols-2'>
						<TabsTrigger value='join' className='flex items-center gap-2'>
							<Users className='h-4 w-4' />
							Join Team
						</TabsTrigger>
						<TabsTrigger value='create' className='flex items-center gap-2'>
							<UserPlus className='h-4 w-4' />
							Create Team
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value='join' className='mt-6'>
					<div
						className={'flex flex-row justify-center gap-8 flex-wrap-reverse'}
					>
						{/* LEFT SIDE PANEL */}
						<div className='max-w-[600px] flex-1 basis-80 space-y-4'>
							<ManageTeamRequestCard />
						</div>
						{/* RIGHT SIDE PANEL */}
						<ManageNonCaptainsOffersPanel />
					</div>
				</TabsContent>

				<TabsContent value='create' className='mt-6'>
					<CreateTeam />
				</TabsContent>
			</Tabs>
		</div>
	)
}
