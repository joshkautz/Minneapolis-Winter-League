import { OfferDocument, OfferDirection } from '@/shared/utils'
import { NotificationCard } from '@/shared/components'
import { useOffersContext } from '@/providers'
import { useOffer } from '@/shared/hooks'
import { useTeamsContext } from '@/providers'
import {
	DocumentReference,
	DocumentData,
	rejectOffer,
	acceptOffer,
} from '@/firebase/firestore'
import { toast } from 'sonner'
import { ReloadIcon } from '@radix-ui/react-icons'
import { getInviteMessage, getRequestMessage } from '@/shared/utils'
import { NotificationCardItem } from '@/shared/components'

export const ManageCaptainsOffersPanel = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const {
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoading,
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoading,
	} = useOffersContext()

	const { offers: outgoingInvites, offersLoading: outgoingInvitesLoading } =
		useOffer(outgoingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)
	const { offers: incomingRequests, offersLoading: incomingRequestsLoading } =
		useOffer(incomingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)

	const handleReject = (
		offerDocumentReference: DocumentReference<OfferDocument, DocumentData>
	) => {
		rejectOffer(offerDocumentReference)
			.then(() => {
				toast.success('Success', {
					description: 'Request rejected',
				})
			})
			.catch(() => {
				toast.error('Failure', {
					description: 'Request not rejected',
				})
			})
	}

	const handleAccept = (
		offerDocumentReference: DocumentReference<OfferDocument, DocumentData>
	) => {
		acceptOffer(offerDocumentReference)
			.then(() => {
				toast.success('Success', {
					description: 'Request accepted',
				})
			})
			.catch(() => {
				toast.error('Failure', {
					description: 'Request not accepted',
				})
			})
	}

	const handleCancel = (
		offerDocumentReference: DocumentReference<OfferDocument, DocumentData>
	) => {
		rejectOffer(offerDocumentReference)
			.then(() => {
				toast.success('Success', {
					description: 'Invite canceled',
				})
			})
			.catch(() => {
				toast.error('Failure', {
					description: 'Invite not canceled',
				})
			})
	}

	const outgoingActions = [{ title: 'Cancel', action: handleCancel }]
	const incomingActions = [
		{ title: 'Accept', action: handleAccept },
		{ title: 'Reject', action: handleReject },
	]

	return (
		<div className='max-w-[600px] flex-1 basis-80 space-y-4'>
			<NotificationCard
				title={'Incoming requests'}
				description={getRequestMessage(incomingRequests?.length)}
			>
				{incomingOffersQuerySnapshotLoading || incomingRequestsLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
					</div>
				) : (
					incomingRequests?.map((incomingRequest: OfferDocument) => (
						<NotificationCardItem
							key={`incomingRequest-row-${incomingRequest.ref.id}`}
							type={OfferDirection.INCOMING_REQUEST}
							data={incomingRequest}
							statusColor={'bg-primary'}
							message={'would like to join'}
							actionOptions={incomingActions}
						/>
					))
				)}
			</NotificationCard>
			<NotificationCard
				title={'Outgoing invites'}
				description={getInviteMessage(outgoingInvites?.length)}
			>
				{outgoingOffersQuerySnapshotLoading || outgoingInvitesLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
					</div>
				) : (
					outgoingInvites?.map((outgoingInvite: OfferDocument) => (
						<NotificationCardItem
							key={`outgoingInvite-row-${outgoingInvite.ref.id}`}
							type={OfferDirection.OUTGOING_INVITE}
							data={outgoingInvite}
							statusColor={'bg-muted-foreground'}
							message={'invite sent for'}
							actionOptions={outgoingActions}
						/>
					))
				)}
			</NotificationCard>
		</div>
	)
}
