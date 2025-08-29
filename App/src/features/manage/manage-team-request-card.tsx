import {
	DocumentSnapshot,
	QueryDocumentSnapshot,
} from '@/firebase/firestore'
import { createOfferViaFunction } from '@/firebase/collections/functions'
import { useTeamsContext } from '@/providers'
import { useCallback } from 'react'
import { NotificationCard } from '@/shared/components'
import { useAuthContext } from '@/providers'
import { toast } from 'sonner'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { ManageTeamDetail } from './manage-team-detail'
import { ReloadIcon } from '@radix-ui/react-icons'

export const ManageTeamRequestCard = () => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const {
		currentSeasonTeamsQuerySnapshot,
		currentSeasonTeamsQuerySnapshotLoading,
	} = useTeamsContext()

	const handleRequest = useCallback(
		async (
			authenticatedUserDocumentSnapshot:
				| DocumentSnapshot<PlayerDocument>
				| undefined,

			teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument>
		) => {
			if (!authenticatedUserDocumentSnapshot?.id || !teamQueryDocumentSnapshot?.id) {
				toast.error('Missing required data to send request')
				return
			}

			createOfferViaFunction({
				playerId: authenticatedUserDocumentSnapshot.id,
				teamId: teamQueryDocumentSnapshot.id,
				type: 'request',
			})
				.then(() => {
					toast.success('Request sent', {
						description: 'you requested to join',
					})
				})
				.catch(() => {
					toast.error('Unable to send request', {
						description:
							'Ensure your email is verified. Please try again later.',
					})
				})
		},
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
