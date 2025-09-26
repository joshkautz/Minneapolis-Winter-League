import { OfferDocument, OfferDirection } from '@/shared/utils'
import { NotificationCard } from '@/shared/components'
import { useOffersContext } from '@/providers'
import { useOffer } from '@/shared/hooks'
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
		} catch {
			toast.error('Failure', {
				description: 'Invite not rejected',
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
		} catch {
			toast.error('Failure', {
				description: 'Invite not accepted',
			})
		}
	}

	const handleCancel = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'rejected',
			})
			toast.success('Success', {
				description: 'Request canceled',
			})
		} catch {
			toast.error('Failure', {
				description: 'Request not canceled',
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
				title={'Incoming invites'}
				description={getInviteMessage(incomingInvites?.length)}
			>
				{incomingOffersQuerySnapshotLoading || incomingInvitesLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : (
					incomingInvites?.map((incomingInvite: OfferDocument) => (
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
			</NotificationCard>{' '}
			<NotificationCard
				title={'Outgoing requests'}
				description={getRequestMessage(outgoingRequests?.length)}
			>
				{outgoingOffersQuerySnapshotLoading || outgoingRequestsLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : (
					outgoingRequests?.map((outgoingRequest: OfferDocument) => (
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
