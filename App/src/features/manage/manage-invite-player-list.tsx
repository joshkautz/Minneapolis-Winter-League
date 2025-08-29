import {
	invitePlayer,
	getPlayersQuery,
	QueryDocumentSnapshot,
	DocumentSnapshot,
} from '@/firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { NotificationCard } from '@/shared/components'
import { toast } from 'sonner'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { ManageInvitePlayerDetail } from './manage-invite-player-detail'
import { ManageInvitePlayerSearchBar } from './manage-invite-player-search-bar'
import { usePlayersSearch } from '@/shared/hooks'
import { useDebounce } from '@/shared/hooks'
import { useSeasonsContext } from '@/providers'
import { useTeamsContext } from '@/providers'
import { useAuthContext } from '@/providers'
import type { PlayerSeason } from '@/types'

export const ManageInvitePlayerList = () => {
	const [search, setSearch] = useState('')
	const debouncedSearch = useDebounce(search)

	const playersQuery = useMemo(
		() => getPlayersQuery(debouncedSearch),
		[debouncedSearch]
	)

	const { playersQuerySnapshot, playersQuerySnapshotLoading } =
		usePlayersSearch(playersQuery)

	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { authenticatedUserSnapshot } = useAuthContext()

	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					authenticatedUserSnapshot
						?.data()
						?.seasons.find(
							(item: PlayerSeason) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[
			authenticatedUserSnapshot,
			currentSeasonTeamsQuerySnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const handleInvite = useCallback(
		(
			playerQueryDocumentSnapshot: QueryDocumentSnapshot<PlayerDocument>,
			teamQueryDocumentSnapshot:
				| QueryDocumentSnapshot<TeamDocument>
				| undefined,
			authenticatedUserDocumentSnapshot:
				| DocumentSnapshot<PlayerDocument>
				| undefined
		) => {
			invitePlayer(
				playerQueryDocumentSnapshot,
				teamQueryDocumentSnapshot,
				authenticatedUserDocumentSnapshot
			)
				?.then(() => {
					toast.success('Invite sent', {
						description: `${playerQueryDocumentSnapshot.data().firstname} ${playerQueryDocumentSnapshot.data().lastname} has been invited to join ${teamQueryDocumentSnapshot?.data().name}.`,
					})
				})
				.catch(() => {
					toast.error('Invite failed', {
						description: 'Ensure your email is verified.',
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
			searchBar={
				<ManageInvitePlayerSearchBar
					value={search}
					onChange={setSearch}
					searching={playersQuerySnapshotLoading}
				/>
			}
		>
			{playersQuerySnapshot?.empty || search.length === 0 ? (
				<span>No players found</span>
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
		</NotificationCard>
	)
}
