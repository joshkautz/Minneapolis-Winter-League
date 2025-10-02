/**
 * Payment-related Firestore operations (Stripe integration)
 */

import { addDoc, collection, onSnapshot } from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { getCurrentSeasonPrice } from '../stripe'
import { CheckoutSessionDocument } from '@/shared/utils'
import type { DocumentReference } from 'firebase/firestore'

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
				allow_promotion_codes: true,
				price: getCurrentSeasonPrice(),
				success_url: window.location.href,
				cancel_url: window.location.href,
			}
		) as Promise<DocumentReference<CheckoutSessionDocument>>
	).then((checkoutSessionDocumentReference) => {
		// Listen for the URL of the Checkout Session
		onSnapshot(
			checkoutSessionDocumentReference,
			(checkoutSessionDocumentSnapshot) => {
				const data = checkoutSessionDocumentSnapshot.data()
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
