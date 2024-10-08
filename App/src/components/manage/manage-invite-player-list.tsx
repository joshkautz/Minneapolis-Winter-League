import {
	DocumentData,
	invitePlayer,
	getPlayersQuery,
	QueryDocumentSnapshot,
	DocumentSnapshot,
} from '@/firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { NotificationCard } from '../notification-card'
import { toast } from '../ui/use-toast'
import { PlayerData, TeamData } from '@/lib/interfaces'
import { ManageInvitePlayerDetail } from './manage-invite-player-detail'
import { ManageInvitePlayerSearchBar } from './manage-invite-player-search-bar'
import { usePlayersSearch } from '../use-players-search'
import { useDebounce } from '@/lib/use-debounce'
import { useSeasonsContext } from '@/contexts/seasons-context'
import { useTeamsContext } from '@/contexts/teams-context'
import { useAuthContext } from '@/contexts/auth-context'

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

	const handleInvite = useCallback(
		(
			playerQueryDocumentSnapshot: QueryDocumentSnapshot<
				PlayerData,
				DocumentData
			>,
			teamQueryDocumentSnapshot:
				| QueryDocumentSnapshot<TeamData, DocumentData>
				| undefined,
			authenticatedUserDocumentSnapshot:
				| DocumentSnapshot<PlayerData, DocumentData>
				| undefined
		) => {
			invitePlayer(
				playerQueryDocumentSnapshot,
				teamQueryDocumentSnapshot,
				authenticatedUserDocumentSnapshot
			)
				?.then(() => {
					toast({
						title: 'Invite sent',
						description: `${playerQueryDocumentSnapshot.data().firstname} ${playerQueryDocumentSnapshot.data().lastname} has been invited to join ${teamQueryDocumentSnapshot?.data().name}.`,
						variant: 'default',
					})
				})
				.catch(() => {
					toast({
						title: 'Invite failed',
						description: 'Ensure your email is verified.',
						variant: 'destructive',
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
