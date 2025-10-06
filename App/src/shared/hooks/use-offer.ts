import { getPlayerSnapshot } from '@/firebase/firestore'
import { QuerySnapshot, QueryDocumentSnapshot } from '@firebase/firestore'
import { useEffect, useState } from 'react'
import { OfferDocument, TeamDocument } from '@/shared/utils'
import { DocumentReference } from 'firebase/firestore'

// Extended OfferDocument with UI-specific fields for display
export interface OfferDocumentWithUI extends OfferDocument {
	/** Resolved player name for display (populated by frontend) */
	playerName: string
	/** Resolved team name for display (populated by frontend) */
	teamName: string
	/** Resolved creator name for display (populated by frontend) */
	creatorName: string
	/** Document reference for actions */
	ref: DocumentReference<OfferDocument>
}

export const useOffer = (
	offersQuerySnapshot: QuerySnapshot<OfferDocument> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
) => {
	const [offers, setOffers] = useState<OfferDocumentWithUI[] | undefined>()
	const [offersLoading, setOffersLoading] = useState<boolean>(true)

	useEffect(() => {
		if (!offersQuerySnapshot || !teamsQuerySnapshot) {
			setOffersLoading(false)
			return undefined
		}

		setOffersLoading(true)

		Promise.all(
			offersQuerySnapshot.docs.map(
				async (offer: QueryDocumentSnapshot<OfferDocument>, index: number) => {
					const offerData = offer.data()

					// Get both player and creator data
					const [playerSnapshot, creatorSnapshot] = await Promise.all([
						getPlayerSnapshot(offerData.player),
						offerData.createdBy ? getPlayerSnapshot(offerData.createdBy) : null,
					])

					return {
						...offerData,
						playerName: `${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`,
						teamName:
							teamsQuerySnapshot?.docs
								.find(
									(team: QueryDocumentSnapshot<TeamDocument>) =>
										team.id === offerData.team.id
								)
								?.data().name || '',
						creatorName: creatorSnapshot
							? `${creatorSnapshot.data()?.firstname} ${creatorSnapshot.data()?.lastname}`
							: 'Unknown',
						ref: offersQuerySnapshot.docs[index].ref,
					} as OfferDocumentWithUI
				}
			)
		).then((updatedOffers: OfferDocumentWithUI[]) => {
			setOffersLoading(false)
			setOffers(updatedOffers)
		})
	}, [offersQuerySnapshot, teamsQuerySnapshot])

	return { offers, offersLoading }
}
