import { useEffect } from 'react'
import {
	QueryDocumentSnapshot,
	DocumentSnapshot,
	offersForPlayerByTeamQuery,
} from '@/firebase'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
	PlayerDocument,
	TeamDocument,
	OfferDocument,
	OfferStatus,
	logger,
} from '@/shared/utils'
import { Link } from 'react-router-dom'

export const ManageTeamDetail = ({
	handleRequest,
	currentSeasonTeamsQueryDocumentSnapshot,
	playerDocumentSnapshot,
}: {
	handleRequest: (
		authenticatedUserDocumentSnapshot:
			| DocumentSnapshot<PlayerDocument>
			| undefined,
		teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument>
	) => Promise<void> | undefined
	currentSeasonTeamsQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument>
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined
}) => {
	const [offersForPlayerByTeamQuerySnapshot, , offersError] = useCollection(
		offersForPlayerByTeamQuery(
			playerDocumentSnapshot,
			currentSeasonTeamsQueryDocumentSnapshot
		)
	)

	// Log and notify on query errors
	useEffect(() => {
		if (offersError) {
			logger.error('Failed to load offers:', {
				component: 'ManageTeamDetail',
				teamId: currentSeasonTeamsQueryDocumentSnapshot.id,
				error: offersError.message,
			})
			toast.error('Failed to load offers', {
				description: offersError.message,
			})
		}
	}, [offersError, currentSeasonTeamsQueryDocumentSnapshot.id])

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

	return (
		<div className='flex items-center gap-2 py-2'>
			<Link to={`/teams/${currentSeasonTeamsQueryDocumentSnapshot.id}`}>
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
			<Link to={`/teams/${currentSeasonTeamsQueryDocumentSnapshot.id}`}>
				<div className='mr-2'>
					<p>{currentSeasonTeamsQueryDocumentSnapshot.data().name}</p>
				</div>
			</Link>
			<div className='flex justify-end flex-1 gap-2'>
				<Button
					size={'sm'}
					variant={'default'}
					disabled={isRequestDisabled}
					onClick={() =>
						handleRequest(
							playerDocumentSnapshot,
							currentSeasonTeamsQueryDocumentSnapshot
						)
					}
				>
					Request to join
				</Button>
			</div>
		</div>
	)
}
