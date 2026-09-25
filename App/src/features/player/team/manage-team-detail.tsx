import {
	QueryDocumentSnapshot,
	DocumentSnapshot,
	offersForPlayerByTeamQuery,
} from '@/firebase'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	canonicalTeamRefFromTeamSeasonDoc,
} from '@/firebase/collections/teams'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { LoadingButton } from '@/shared/components'
import { usePendingAction } from '@/shared/hooks/use-pending-action'
import {
	PlayerDocument,
	TeamSeasonDocument,
	OfferDocument,
	OfferStatus,
} from '@/shared/utils'
import { Link } from 'react-router-dom'
import { useQueryErrorHandler } from '@/shared/hooks'

export const ManageTeamDetail = ({
	handleRequest,
	currentSeasonTeamsQueryDocumentSnapshot,
	playerDocumentSnapshot,
}: {
	handleRequest: (
		authenticatedUserDocumentSnapshot:
			DocumentSnapshot<PlayerDocument> | undefined,
		teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamSeasonDocument>
	) => Promise<boolean>
	currentSeasonTeamsQueryDocumentSnapshot: QueryDocumentSnapshot<TeamSeasonDocument>
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined
}) => {
	const [offersForPlayerByTeamQuerySnapshot, , offersError] = useCollection(
		offersForPlayerByTeamQuery(
			playerDocumentSnapshot?.ref,
			canonicalTeamRefFromTeamSeasonDoc(currentSeasonTeamsQueryDocumentSnapshot)
		)
	)

	const teamId = canonicalTeamIdFromTeamSeasonDoc(
		currentSeasonTeamsQueryDocumentSnapshot
	)

	useQueryErrorHandler({
		error: offersError,
		component: 'ManageTeamDetail',
		errorLabel: 'offers',
		context: { teamId },
	})

	// Check for offers that should block new requests
	const blockingOffers = offersForPlayerByTeamQuerySnapshot?.docs.filter(
		(doc) => {
			const offer = doc.data() as OfferDocument
			// Only block if pending (prevents duplicate requests)
			// Allow if rejected (captain said no, but player can try again)
			// Allow if canceled (player changed mind previously)
			// Allow if accepted (handled by team membership check)
			return offer.status === OfferStatus.PENDING
		}
	)

	const isRequestDisabled = (blockingOffers?.length ?? 0) > 0
	// Stays pending until the new offer arrives through the listener above.
	const { pending: isRequesting, run } = usePendingAction(isRequestDisabled)

	return (
		<div className='flex items-center gap-2 py-2'>
			<Link
				to={`/teams/${teamId}/${currentSeasonTeamsQueryDocumentSnapshot.id}`}
			>
				<Avatar>
					<AvatarImage
						src={
							currentSeasonTeamsQueryDocumentSnapshot.data().logo ?? undefined
						}
						alt={'team logo'}
					/>
					<AvatarFallback>
						{currentSeasonTeamsQueryDocumentSnapshot.data().name?.slice(0, 2) ??
							'NA'}
					</AvatarFallback>
				</Avatar>
			</Link>
			<Link
				to={`/teams/${teamId}/${currentSeasonTeamsQueryDocumentSnapshot.id}`}
			>
				<div className='mr-2'>
					<p>{currentSeasonTeamsQueryDocumentSnapshot.data().name}</p>
				</div>
			</Link>
			<div className='flex justify-end flex-1 gap-2'>
				<LoadingButton
					size={'sm'}
					variant={isRequestDisabled ? 'outline' : 'default'}
					disabled={isRequestDisabled}
					loading={isRequesting}
					loadingText='Requesting...'
					onClick={() =>
						run(() =>
							handleRequest(
								playerDocumentSnapshot,
								currentSeasonTeamsQueryDocumentSnapshot
							)
						)
					}
				>
					{isRequestDisabled ? 'Requested' : 'Request to join'}
				</LoadingButton>
			</div>
		</div>
	)
}
