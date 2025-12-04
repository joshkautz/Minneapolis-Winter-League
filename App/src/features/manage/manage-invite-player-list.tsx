import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getPlayersQuery, QueryDocumentSnapshot } from '@/firebase/firestore'
import { createOfferViaFunction } from '@/firebase/collections/functions'
import { NotificationCard } from '@/shared/components'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { ManageInvitePlayerDetail } from './manage-invite-player-detail'
import { ManageInvitePlayerSearchBar } from './manage-invite-player-search-bar'
import { usePlayersSearch, useDebounce, useUserStatus } from '@/shared/hooks'
import { useTeamsContext } from '@/providers'

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
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	const handleInvite = useCallback(
		(
			playerQueryDocumentSnapshot: QueryDocumentSnapshot<PlayerDocument>,
			teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument> | undefined
		) => {
			if (!playerQueryDocumentSnapshot?.id || !teamQueryDocumentSnapshot?.id) {
				toast.error('Missing required data to send invite')
				return
			}

			createOfferViaFunction({
				playerId: playerQueryDocumentSnapshot.id,
				teamId: teamQueryDocumentSnapshot.id,
				type: 'invitation',
			})
				.then(() => {
					toast.success('Invite sent', {
						description: `${playerQueryDocumentSnapshot.data().firstname} ${playerQueryDocumentSnapshot.data().lastname} has been invited to join ${teamQueryDocumentSnapshot?.data().name}.`,
					})
				})
				.catch((error: unknown) => {
					// Firebase Functions errors have a message property
					const firebaseError = error as { message?: string }
					const errorMessage = firebaseError?.message || 'Failed to send invite'
					toast.error('Invite failed', {
						description: errorMessage,
					})
				})
		},
		[]
	)

	return (
		<NotificationCard
			title={'Invite players'}
			description={'players eligible for team roster invitations.'}
			scrollArea
			className='w-full max-w-full overflow-hidden'
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
