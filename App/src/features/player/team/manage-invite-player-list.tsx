import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getPlayersQuery, QueryDocumentSnapshot } from '@/firebase'
import { createOfferViaFunction } from '@/firebase/collections/functions'
import { NotificationCard } from '@/shared/components'
import {
	OfferType,
	PlayerDocument,
	TeamSeasonDocument,
	errorMessage,
} from '@/shared/utils'
import { ManageInvitePlayerDetail } from './manage-invite-player-detail'
import { ManageInvitePlayerSearchBar } from './manage-invite-player-search-bar'
import { usePlayersSearch, useDebounce, useUserStatus } from '@/shared/hooks'
import { useTeamsContext } from '@/providers'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'

export const ManageInvitePlayerList = () => {
	const [search, setSearch] = useState('')
	const debouncedSearch = useDebounce(search)

	const playersQuery = useMemo(
		() => getPlayersQuery(debouncedSearch),
		[debouncedSearch]
	)

	const { playersQuerySnapshot, playersQuerySnapshotLoading } =
		usePlayersSearch(playersQuery)

	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonData } = useUserStatus()

	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					canonicalTeamIdFromTeamSeasonDoc(team) === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	// Resolves to whether the invite was sent; failures are toasted here.
	const handleInvite = useCallback(
		async (
			playerQueryDocumentSnapshot: QueryDocumentSnapshot<PlayerDocument>,
			teamQueryDocumentSnapshot:
				QueryDocumentSnapshot<TeamSeasonDocument> | undefined
		): Promise<boolean> => {
			const canonicalTeamId = teamQueryDocumentSnapshot
				? canonicalTeamIdFromTeamSeasonDoc(teamQueryDocumentSnapshot)
				: undefined
			if (!playerQueryDocumentSnapshot?.id || !canonicalTeamId) {
				toast.error('Missing required data to send invite')
				return false
			}

			try {
				await createOfferViaFunction({
					playerId: playerQueryDocumentSnapshot.id,
					teamId: canonicalTeamId,
					type: OfferType.INVITATION,
				})
				toast.success('Invite sent', {
					description: `${playerQueryDocumentSnapshot.data().firstname} ${playerQueryDocumentSnapshot.data().lastname} has been invited to join ${teamQueryDocumentSnapshot?.data().name}.`,
				})
				return true
			} catch (error: unknown) {
				const description = errorMessage(
					error,
					'The invite could not be sent. Please try again.'
				)
				toast.error('Invite failed', {
					description,
				})
				return false
			}
		},
		[]
	)

	return (
		<NotificationCard
			title={'Invite Players'}
			description={'Players eligible for team roster invitations'}
			scrollArea
			className='max-w-none'
			searchBar={
				<ManageInvitePlayerSearchBar
					value={search}
					onChange={setSearch}
					searching={playersQuerySnapshotLoading}
				/>
			}
		>
			<div className='w-full min-w-0'>
				{playersQuerySnapshot?.empty || search.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
						<div className='space-y-3'>
							<p className='text-muted-foreground font-medium text-lg'>
								{search.length === 0
									? 'Search for players to invite'
									: 'No players found'}
							</p>
							<p className='text-muted-foreground/70 text-sm max-w-md'>
								{search.length === 0
									? "Start typing a player's name to find eligible players for your team roster."
									: `No players match "${search}". Try adjusting your search terms or check the spelling.`}
							</p>
						</div>
					</div>
				) : (
					playersQuerySnapshot?.docs.map((playerQueryDocumentSnapshot) => (
						<ManageInvitePlayerDetail
							key={playerQueryDocumentSnapshot.id}
							handleInvite={handleInvite}
							teamQueryDocumentSnapshot={teamQueryDocumentSnapshot}
							playerQueryDocumentSnapshot={playerQueryDocumentSnapshot}
						/>
					))
				)}
			</div>
		</NotificationCard>
	)
}
