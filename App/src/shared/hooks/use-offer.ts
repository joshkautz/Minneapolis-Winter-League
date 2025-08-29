import { getPlayerSnapshot } from '@/firebase/firestore'
import { QuerySnapshot, QueryDocumentSnapshot } from '@firebase/firestore'
import { useEffect, useState } from 'react'
import { OfferDocument, TeamDocument } from '@/shared/utils'

export const useOffer = (
	offersQuerySnapshot: QuerySnapshot<OfferDocument> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
) => {
	const [offers, setOffers] = useState<OfferDocument[] | undefined>()
	const [offersLoading, setOffersLoading] = useState<boolean>(true)

	useEffect(() => {
		if (!offersQuerySnapshot || !teamsQuerySnapshot) {
			setOffersLoading(false)
			return undefined
		}

		setOffersLoading(true)

		Promise.all(
			offersQuerySnapshot.docs.map(
				async (offer: QueryDocumentSnapshot<OfferDocument>, index: number) =>
					getPlayerSnapshot(offer.data().player).then(
						(playerSnapshot) =>
							({
								...offer.data(),
								playerName: `${
									playerSnapshot.data()?.firstname
								} ${playerSnapshot.data()?.lastname}`,
								teamName: teamsQuerySnapshot?.docs
									.find(
										(team: QueryDocumentSnapshot<TeamDocument>) =>
											team.id == offer.data().team.id
									)
									?.data().name,
								ref: offersQuerySnapshot.docs[index].ref,
							}) as OfferDocument
					)
			)
		).then((updatedOffers: OfferDocument[]) => {
			setOffersLoading(false)
			setOffers(updatedOffers)
		})
	}, [offersQuerySnapshot, teamsQuerySnapshot])

	return { offers, offersLoading }
}
