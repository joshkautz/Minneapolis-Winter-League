/**
 * Payment-related Firestore operations (Stripe integration)
 */

import { addDoc, collection, onSnapshot } from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { Products } from '../stripe'
import { CheckoutSessionDocument } from '@/shared/utils'
import type { DocumentReference } from '@/firebase/adapter'

/**
 * Creates a Stripe checkout session for winter league registration
 */
export const stripeRegistration = async (
	authValue: User | null | undefined,
	setStripeLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setStripeError: React.Dispatch<React.SetStateAction<string | undefined>>
) => {
	setStripeLoading(true)

	// Create new Checkout Session for the player
	return (
		addDoc(
			collection(firestore, `customers/${authValue?.uid}/checkout_sessions`),
			{
				mode: 'payment',
				price: Products.WinterLeagueRegistration2024, // TODO: Add to the season update guide. Add a new product for the new season on Stripe, then add its price code to the Products enum in stripe.ts., and then update this line to use the new product.
				success_url: window.location.href,
				cancel_url: window.location.href,
			}
		) as Promise<DocumentReference<CheckoutSessionDocument>>
	).then((checkoutSessionDocumentReference) => {
		// Listen for the URL of the Checkout Session
		onSnapshot(
			checkoutSessionDocumentReference,
			(checkoutSessionDocumentSnapshot) => {
				const data = checkoutSessionDocumentSnapshot.data() as CheckoutSessionDocument | undefined
				if (data) {
					if (data.url) {
						// We have a Stripe Checkout URL, let's redirect.
						window.location.assign(data.url)
					}
					if (data.error) {
						setStripeLoading(false)
						setStripeError(data.error.message)
					}
				}
			}
		)
	})
}
