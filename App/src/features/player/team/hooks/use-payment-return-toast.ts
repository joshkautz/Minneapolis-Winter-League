import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { cancelTeamContribution } from '@/firebase/collections/payments'

/**
 * Tells the payer how Checkout went, once, when Stripe sends them back to
 * the team page (`?payment=success` or `?payment=cancel`).
 *
 * Mounted by the page rather than the payment card, and only once it knows
 * whether the payer is still on a team: a team that missed the season while
 * they were paying is removed, and they come back to Find a Team with no
 * card on it.
 */
export const usePaymentReturnToast = ({
	isLoading,
	onTeam,
}: {
	isLoading: boolean
	onTeam: boolean
}): void => {
	const handled = useRef(false)

	useEffect(() => {
		if (isLoading || handled.current) return
		const params = new URLSearchParams(window.location.search)
		const status = params.get('payment')
		if (status !== 'success' && status !== 'cancel') return
		handled.current = true

		if (status === 'success') {
			if (onTeam) {
				toast.success('Payment received', {
					description:
						'Your contribution will appear here in a moment. Thank you!',
				})
			} else {
				toast.info('Payment received, and being refunded', {
					description:
						'Your team is no longer in the season, so your payment is being refunded. You will get a receipt by email when it goes through.',
				})
			}
		} else {
			// Free the amount the checkout set aside, so teammates can pay it
			// now rather than when the session times out.
			void cancelTeamContribution()
			toast.info('Payment cancelled', {
				description: 'Nothing was charged. You can try again when ready.',
			})
		}
		params.delete('payment')
		const query = params.toString()
		window.history.replaceState(
			{},
			'',
			window.location.pathname + (query ? `?${query}` : '')
		)
	}, [isLoading, onTeam])
}
