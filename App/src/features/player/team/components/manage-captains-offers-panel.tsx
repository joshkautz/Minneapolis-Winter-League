import { toast } from 'sonner'
import { logger, errorMessage } from '@/shared/utils'
import { OfferDocument, OfferDirection, OfferStatus } from '@/types'
import {
	NotificationCard,
	LoadingSpinner,
	NotificationCardItem,
} from '@/shared/components'
import { useOffersContext, useTeamsContext } from '@/providers'
import { useOffer, OfferDocumentWithUI } from '@/shared/hooks'
import { type DocumentReference } from 'firebase/firestore'
import { updateOfferViaFunction } from '@/firebase/collections/functions'

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

	const handleReject = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferViaFunction({
				offerId: offerDocumentReference.id,
				status: OfferStatus.REJECTED,
			})
			toast.success('Success', {
				description: 'Request rejected',
			})
		} catch (error: unknown) {
			const description = errorMessage(
				error,
				'The request could not be rejected. Please try again.'
			)
			logger.error('Failed to reject offer', error)
			toast.error('Failure', {
				description,
			})
		}
	}

	const handleAccept = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferViaFunction({
				offerId: offerDocumentReference.id,
				status: OfferStatus.ACCEPTED,
			})
			toast.success('Success', {
				description: 'Request accepted',
			})
		} catch (error: unknown) {
			const description = errorMessage(
				error,
				'The request could not be accepted. Please try again.'
			)
			logger.error('Failed to accept offer', error)
			toast.error('Failure', {
				description,
			})
		}
	}

	const handleCancel = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		try {
			await updateOfferViaFunction({
				offerId: offerDocumentReference.id,
				status: OfferStatus.CANCELED,
			})
			toast.success('Success', {
				description: 'Invite canceled',
			})
		} catch (error: unknown) {
			const description = errorMessage(
				error,
				'The invite could not be canceled. Please try again.'
			)
			logger.error('Failed to cancel offer', error)
			toast.error('Failure', {
				description,
			})
		}
	}

	return (
		<div className='w-full space-y-4'>
			<NotificationCard
				title={'Incoming Requests'}
				description={'Players that want to join your team'}
				className='max-w-none'
			>
				{incomingOffersQuerySnapshotLoading || incomingRequestsLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : !incomingRequests || incomingRequests.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
						<div className='space-y-3'>
							<p className='text-muted-foreground font-medium text-lg'>
								No incoming requests
							</p>
							<p className='text-muted-foreground/70 text-sm max-w-md'>
								No players have requested to join your team yet. When players
								send requests, they will appear here for you to review.
							</p>
						</div>
					</div>
				) : (
					incomingRequests?.map((incomingRequest: OfferDocumentWithUI) => {
						return (
							<NotificationCardItem
								key={`incomingRequest-row-${incomingRequest.ref.id}`}
								type={OfferDirection.INCOMING_REQUEST}
								data={incomingRequest}
								statusColor={'bg-primary'}
								message={'would like to join'}
								actionOptions={[
									{
										title: 'Accept',
										pendingTitle: 'Accepting...',
										action: handleAccept,
									},
									{
										title: 'Reject',
										pendingTitle: 'Rejecting...',
										action: handleReject,
									},
								]}
							/>
						)
					})
				)}
			</NotificationCard>
			<NotificationCard
				title={'Outgoing Invitations'}
				description={'Players you have invited to join'}
				className='max-w-none'
			>
				{outgoingOffersQuerySnapshotLoading || outgoingInvitesLoading ? (
					<div className={'inset-0 flex items-center justify-center'}>
						<LoadingSpinner size='lg' />
					</div>
				) : !outgoingInvites || outgoingInvites.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 px-6 text-center'>
						<div className='space-y-3'>
							<p className='text-muted-foreground font-medium text-lg'>
								No outgoing invitations
							</p>
							<p className='text-muted-foreground/70 text-sm max-w-md'>
								You haven't sent any invites to players yet. Use the invite
								players section to send invitations to join your team.
							</p>
						</div>
					</div>
				) : (
					outgoingInvites?.map((outgoingInvite: OfferDocumentWithUI) => {
						return (
							<NotificationCardItem
								key={`outgoingInvite-row-${outgoingInvite.ref.id}`}
								type={OfferDirection.OUTGOING_INVITE}
								data={outgoingInvite}
								statusColor={'bg-primary'}
								message={'invited to join'}
								actionOptions={[
									{
										title: 'Cancel',
										pendingTitle: 'Canceling...',
										action: handleCancel,
									},
								]}
							/>
						)
					})
				)}
			</NotificationCard>
		</div>
	)
}
