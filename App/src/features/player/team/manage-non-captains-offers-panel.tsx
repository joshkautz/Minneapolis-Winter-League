import { useState } from 'react'
import { toast } from 'sonner'
import { OfferDocument, OfferDirection, logger } from '@/shared/utils'
import {
	NotificationCard,
	LoadingSpinner,
	NotificationCardItem,
} from '@/shared/components'
import { useOffersContext, useTeamsContext } from '@/providers'
import { useOffer, OfferDocumentWithUI } from '@/shared/hooks'
import { DocumentReference } from '@/firebase'
import { updateOfferStatusViaFunction } from '@/firebase/collections/functions'

export const ManageNonCaptainsOffersPanel = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const {
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoading,
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoading,
	} = useOffersContext()

	const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null)

	const { offers: outgoingRequests, offersLoading: outgoingRequestsLoading } =
		useOffer(outgoingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)
	const { offers: incomingInvites, offersLoading: incomingInvitesLoading } =
		useOffer(incomingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)

	const handleReject = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		setLoadingOfferId(offerDocumentReference.id)
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'rejected',
			})
			toast.success('Success', {
				description: 'Invite rejected',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string }
			const errorMessage = firebaseError?.message || 'Invite not rejected'
			logger.error('Invite rejection failed:', error)
			toast.error('Failure', {
				description: errorMessage,
			})
		} finally {
			setLoadingOfferId(null)
		}
	}

	const handleAccept = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		setLoadingOfferId(offerDocumentReference.id)
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'accepted',
			})
			toast.success('Success', {
				description: 'Invite accepted',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string }
			const errorMessage = firebaseError?.message || 'Invite not accepted'
			logger.error('Invite acceptance failed:', error)
			toast.error('Failure', {
				description: errorMessage,
			})
		} finally {
			setLoadingOfferId(null)
		}
	}

	const handleCancel = async (
		offerDocumentReference: DocumentReference<OfferDocument>
	) => {
		setLoadingOfferId(offerDocumentReference.id)
		try {
			await updateOfferStatusViaFunction({
				offerId: offerDocumentReference.id,
				status: 'canceled',
			})
			toast.success('Success', {
				description: 'Request canceled',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string }
			const errorMessage = firebaseError?.message || 'Request not canceled'
			logger.error('Request cancellation failed:', error)
			toast.error('Failure', {
				description: errorMessage,
			})
		} finally {
			setLoadingOfferId(null)
		}
	}

	return (
		<div className='w-full space-y-4'>
			<NotificationCard
				title={'Incoming Invitations'}
				description={'Teams that want you to join'}
				className='max-w-none'
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
					incomingInvites?.map((incomingInvite: OfferDocumentWithUI) => {
						const isLoading = loadingOfferId === incomingInvite.ref.id
						return (
							<NotificationCardItem
								key={`incomingInvite-row-${incomingInvite.ref.id}`}
								type={OfferDirection.INCOMING_INVITE}
								data={incomingInvite}
								statusColor={'bg-primary'}
								message={'would like you to join'}
								actionOptions={[
									{
										title: 'Accept',
										action: handleAccept,
										isLoading: isLoading,
									},
									{
										title: 'Reject',
										action: handleReject,
										isLoading: isLoading,
									},
								]}
							/>
						)
					})
				)}
			</NotificationCard>
			<NotificationCard
				title={'Outgoing Requests'}
				description={'Teams that you want to join'}
				className='max-w-none'
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
					outgoingRequests?.map((outgoingRequest: OfferDocumentWithUI) => {
						const isLoading = loadingOfferId === outgoingRequest.ref.id
						return (
							<NotificationCardItem
								key={`outgoingRequest-row-${outgoingRequest.ref.id}`}
								type={OfferDirection.OUTGOING_REQUEST}
								data={outgoingRequest}
								statusColor={'bg-primary'}
								message={'requested to join'}
								actionOptions={[
									{
										title: 'Cancel',
										action: handleCancel,
										isLoading: isLoading,
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
