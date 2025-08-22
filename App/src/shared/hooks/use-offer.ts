import { getPlayerSnapshot } from '@/firebase/firestore'
import { QuerySnapshot, DocumentData } from '@firebase/firestore'
import { useEffect, useState } from 'react'
import { ExtendedOfferData, OfferData, TeamData } from '@/shared/utils'

export const useOffer = (
	offersQuerySnapshot: QuerySnapshot<OfferData, DocumentData> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamData, DocumentData> | undefined
) => {
	const [offers, setOffers] = useState<ExtendedOfferData[] | undefined>()
	const [offersLoading, setOffersLoading] = useState<boolean>(true)

	useEffect(() => {
		if (!offersQuerySnapshot || !teamsQuerySnapshot) {
			setOffersLoading(false)
			return undefined
		}

		setOffersLoading(true)

		Promise.all(
			offersQuerySnapshot.docs.map(async (offer: DocumentData, index: number) =>
				getPlayerSnapshot(offer.data().player).then(
					(playerSnapshot) =>
						({
							...offer.data(),
							playerName: `${
								playerSnapshot.data()?.firstname
							} ${playerSnapshot.data()?.lastname}`,
							teamName: teamsQuerySnapshot?.docs
								.find((team) => team.id == offer.data().team.id)
								?.data().name,
							ref: offersQuerySnapshot.docs[index].ref,
						}) as ExtendedOfferData
				)
			)
		).then((updatedOffers) => {
			setOffersLoading(false)
			setOffers(updatedOffers)
		})
	}, [offersQuerySnapshot, teamsQuerySnapshot])

	return { offers, offersLoading }
}
