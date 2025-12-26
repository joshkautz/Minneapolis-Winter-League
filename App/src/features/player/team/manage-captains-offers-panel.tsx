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

export const ManageCaptainsOffersPanel = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const {
		outgoingOffersQuerySnapshot,
		outgoingOffersQuerySnapshotLoading,
		incomingOffersQuerySnapshot,
		incomingOffersQuerySnapshotLoading,
	} = useOffersContext()

	const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null)

	const { offers: outgoingInvites, offersLoading: outgoingInvitesLoading } =
		useOffer(outgoingOffersQuerySnapshot, currentSeasonTeamsQuerySnapshot)
	const { offers: incomingRequests, offersLoading: incomingRequestsLoading } =
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
				description: 'Request rejected',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string; code?: string }
			const errorMessage =
				firebaseError?.message ||
				firebaseError?.code ||
				'Failed to reject request'
			logger.error('Failed to reject offer:', error)
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
				description: 'Request accepted',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string; code?: string }
			const errorMessage =
				firebaseError?.message ||
				firebaseError?.code ||
				'Failed to accept request'
			logger.error('Failed to accept offer:', error)
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
				description: 'Invite canceled',
			})
		} catch (error: unknown) {
			// Firebase Functions errors have a message property
			const firebaseError = error as { message?: string; code?: string }
			const errorMessage =
				firebaseError?.message ||
				firebaseError?.code ||
				'Failed to cancel invite'
			logger.error('Failed to cancel offer:', error)
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
						const isLoading = loadingOfferId === incomingRequest.ref.id
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
						const isLoading = loadingOfferId === outgoingInvite.ref.id
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
