import { OfferDocument, OfferDirection } from '@/shared/utils'
import { NotificationCard } from '@/shared/components'
import { useOffersContext } from '@/providers'
import { useOffer, OfferDocumentWithUI } from '@/shared/hooks'
import { useTeamsContext } from '@/providers'
import { DocumentReference } from '@/firebase/firestore'
import { updateOfferStatusViaFunction } from '@/firebase/collections/functions'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/shared/components'
import { getInviteMessage, getRequestMessage } from '@/shared/utils'
import { NotificationCardItem } from '@/shared/components'

export const ManageNonCaptainsOffersPanel = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const {
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoading,
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoading,
	} = useOffersContext()

	const { offers: outgoingRequests, offersLoading: outgoingRequestsLoading } =
		useOffer(outgoingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)
	const { offers: incomingInvites, offersLoading: incomingInvitesLoading } =
		useOffer(incomingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)

	const handleReject = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'rejected',
			})
			toast.success('Success', {
				description: 'Invite rejected',
			})
		} catch (error: any) {
			// Firebase Functions errors have a message property
			const errorMessage = error?.message || 'Invite not rejected'
			toast.error('Failure', {
				description: errorMessage,
			})
		}
	}

	const handleAccept = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'accepted',
			})
			toast.success('Success', {
				description: 'Invite accepted',
			})
		} catch (error: any) {
			// Firebase Functions errors have a message property
			const errorMessage = error?.message || 'Invite not accepted'
			toast.error('Failure', {
				description: errorMessage,
			})
		}
	}

	const handleCancel = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'canceled',
			})
			toast.success('Success', {
				description: 'Request canceled',
			})
		} catch (error: any) {
			// Firebase Functions errors have a message property
			const errorMessage = error?.message || 'Request not canceled'
			toast.error('Failure', {
				description: errorMessage,
			})
		}
	}

	const outgoingActions = [{ title: 'Cancel', action: handleCancel }]
	const incomingActions = [
		{ title: 'Accept', action: handleAccept },
		{ title: 'Reject', action: handleReject },
	]

	return (
		<div className='w-full space-y-4'>
			<NotificationCard
				title={'Incoming Invitations'}
				description={getInviteMessage(incomingInvites?.length)}
			>
				{incomingOffersQuerySnapshotLoading || incomingInvitesLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : !incomingInvites || incomingInvites.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
						<div className='space-y-3'>
							<p className='text-muted-foreground font-medium text-lg'>
								No incoming invitations
							</p>
							<p className='text-muted-foreground/70 text-sm max-w-md'>
								No teams have invited you to join yet. When team captains send
								invitations, they will appear here for you to review.
							</p>
						</div>
					</div>
				) : (
					incomingInvites?.map((incomingInvite: OfferDocumentWithUI) => (
						<NotificationCardItem
							key={`incomingInvite-row-${incomingInvite.ref.id}`}
							type={OfferDirection.INCOMING_INVITE}
							data={incomingInvite}
							statusColor={'bg-primary'}
							message={'would like you to join'}
							actionOptions={incomingActions}
						/>
					))
				)}
			</NotificationCard>
			<NotificationCard
				title={'Outgoing Requests'}
				description={getRequestMessage(outgoingRequests?.length)}
			>
				{outgoingOffersQuerySnapshotLoading || outgoingRequestsLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : !outgoingRequests || outgoingRequests.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
						<div className='space-y-3'>
							<p className='text-muted-foreground font-medium text-lg'>
								No outgoing requests
							</p>
							<p className='text-muted-foreground/70 text-sm max-w-md'>
								You haven't requested to join any teams yet. Browse available
								teams above to send join requests.
							</p>
						</div>
					</div>
				) : (
					outgoingRequests?.map((outgoingRequest: OfferDocumentWithUI) => (
						<NotificationCardItem
							key={`outgoingRequest-row-${outgoingRequest.ref.id}`}
							type={OfferDirection.OUTGOING_REQUEST}
							data={outgoingRequest}
							statusColor={'bg-muted-foreground'}
							message={'request sent for'}
							actionOptions={outgoingActions}
						/>
					))
				)}
			</NotificationCard>
		</div>
	)
}
