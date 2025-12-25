import { useCallback } from 'react'
import { toast } from 'sonner'
import { DocumentSnapshot, QueryDocumentSnapshot } from '@/firebase'
import { createOfferViaFunction } from '@/firebase/collections/functions'
import { useTeamsContext, useAuthContext } from '@/providers'
import { NotificationCard, LoadingSpinner } from '@/shared/components'
import { PlayerDocument, TeamDocument } from '@/shared/utils'
import { ManageTeamDetail } from './manage-team-detail'

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
			if (
				!authenticatedUserDocumentSnapshot?.id ||
				!teamQueryDocumentSnapshot?.id
			) {
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
				.catch((error: unknown) => {
					// Firebase Functions errors have a message property
					const firebaseError = error as { message?: string }
					const errorMessage =
						firebaseError?.message || 'Failed to send request'
					toast.error('Unable to send request', {
						description: errorMessage,
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
					<LoadingSpinner size='lg' />
				</div>
			) : currentSeasonTeamsQuerySnapshot?.empty ? (
				<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
					<div className='space-y-3'>
						<p className='text-muted-foreground font-medium text-lg'>
							No teams available
						</p>
						<p className='text-muted-foreground/70 text-sm max-w-md'>
							There are no teams created for this season yet. Check back later
							or contact an administrator.
						</p>
					</div>
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
