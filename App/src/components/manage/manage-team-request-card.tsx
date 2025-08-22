import {
	DocumentData,
	DocumentSnapshot,
	QueryDocumentSnapshot,
	requestToJoinTeam,
} from '@/firebase/firestore'
import { TeamsContext } from '@/contexts/teams-context'
import { useCallback, useContext } from 'react'
import { NotificationCard } from '../notification-card'
import { useAuthContext } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { PlayerData, TeamData } from '@/lib/interfaces'
import { ManageTeamDetail } from './manage-team-detail'
import { ReloadIcon } from '@radix-ui/react-icons'

export const ManageTeamRequestCard = () => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useContext(TeamsContext)

	const handleRequest = useCallback(
		(
			authenticatedUserDocumentSnapshot:
				| DocumentSnapshot<PlayerData, DocumentData>
				| undefined,

			teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamData, DocumentData>
		) =>
			requestToJoinTeam(
				authenticatedUserDocumentSnapshot,
				teamQueryDocumentSnapshot
			)
				?.then(() => {
					toast.success('Request sent', {
			description: 'you requested to join',
		})
				})
				.catch(() => {
					toast.error('Unable to send request', {
			description: 'Ensure your email is verified. Please try again later.',
		})
				}),
		[]
	)

	return (
		<NotificationCard
			title={'Team list'}
			description={'request to join a team below'}
		>
			{currentSeasonTeamsQuerySnapshotLoading ? (
				<div className={'inset-0 flex items-center justify-center'}>
					<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
				</div>
			) : (
				currentSeasonTeamsQuerySnapshot?.docs.map(
					(currentSeasonTeamsQueryDocumentSnapshot) => (
						<ManageTeamDetail
							key={currentSeasonTeamsQueryDocumentSnapshot.id}
							handleRequest={handleRequest}
							currentSeasonTeamsQueryDocumentSnapshot={
								currentSeasonTeamsQueryDocumentSnapshot
							}
							playerDocumentSnapshot={authenticatedUserSnapshot}
						/>
					)
				)
			)}
		</NotificationCard>
	)
}
