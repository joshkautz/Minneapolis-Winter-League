import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { User } from 'firebase/auth'
import { Timestamp, QuerySnapshot, DocumentSnapshot } from '@firebase/firestore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import {
	CheckCircle,
	CreditCard,
	AlertCircle,
	Calendar,
	Tag,
} from 'lucide-react'
import { stripeRegistration, QueryDocumentSnapshot } from '@/firebase'
import {
	formatTimestamp,
	SeasonDocument,
	didPlayerPayPreviousSeason,
} from '@/shared/utils'
import { getSeasonPriceId, getSeasonCouponId } from '@/firebase/stripe'
import type { PlayerDocument } from '@/types'

interface PaymentSectionProps {
	authStateUser: User | null | undefined
	isLoading: boolean
	isAuthenticatedUserAdmin: boolean
	isAuthenticatedUserBanned: boolean
	isAuthenticatedUserPaid: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
	/** Player document snapshot for checking previous season payment */
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
	/** All seasons snapshot for determining previous season */
	seasonsQuerySnapshot: QuerySnapshot<SeasonDocument> | undefined
}

/**
 * PaymentSection Component
 *
 * Handles Stripe payment functionality
 * Extracted from main Profile component for better separation of concerns
 */
export const PaymentSection = ({
	authStateUser,
	isLoading,
	isAuthenticatedUserAdmin,
	isAuthenticatedUserBanned,
	isAuthenticatedUserPaid,
	currentSeasonQueryDocumentSnapshot,
	authenticatedUserSnapshot,
	seasonsQuerySnapshot,
}: PaymentSectionProps) => {
	const [stripeLoading, setStripeLoading] = useState<boolean>(false)
	const [stripeError, setStripeError] = useState<string>()
	const loadingToastId = useRef<string | number | undefined>(undefined)

	// Check for payment status in URL and show toast
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search)
		const paymentStatus = urlParams.get('payment')

		if (paymentStatus === 'success') {
			toast.success('Payment Successful', {
				description:
					'Your registration payment has been processed. Please check your email for the waiver.',
			})
			// Clean up URL
			urlParams.delete('payment')
			const newUrl =
				window.location.pathname +
				(urlParams.toString() ? `?${urlParams.toString()}` : '')
			window.history.replaceState({}, '', newUrl)
		} else if (paymentStatus === 'cancel') {
			toast.info('Payment Cancelled', {
				description:
					'Your payment was cancelled. You can try again when ready.',
			})
			// Clean up URL
			urlParams.delete('payment')
			const newUrl =
				window.location.pathname +
				(urlParams.toString() ? `?${urlParams.toString()}` : '')
			window.history.replaceState({}, '', newUrl)
		}
	}, [])

	useEffect(() => {
		if (stripeError) {
			toast.error('Payment Error', {
				description: stripeError,
			})
			// Schedule clearing for next tick
			const timer = setTimeout(() => setStripeError(undefined), 0)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [stripeError])

	// Show/hide loading toast based on stripeLoading state
	useEffect(() => {
		if (stripeLoading) {
			loadingToastId.current = toast.loading('Creating checkout session...', {
				description: 'Please wait while we connect to Stripe.',
			})
		} else if (loadingToastId.current !== undefined) {
			toast.dismiss(loadingToastId.current)
			loadingToastId.current = undefined
		}
	}, [stripeLoading])

	// Check if player is returning (paid for previous season)
	const isReturningPlayer = useMemo(() => {
		if (!authenticatedUserSnapshot || !seasonsQuerySnapshot) return false
		return didPlayerPayPreviousSeason(
			authenticatedUserSnapshot.data(),
			seasonsQuerySnapshot
		)
	}, [authenticatedUserSnapshot, seasonsQuerySnapshot])

	// Get Stripe price and coupon IDs from season document
	const { priceId, couponId } = useMemo(() => {
		const seasonData = currentSeasonQueryDocumentSnapshot?.data()
		const price = getSeasonPriceId(seasonData)
		// Only get coupon if player is returning
		const coupon = isReturningPlayer ? getSeasonCouponId(seasonData) : null

		return {
			priceId: price,
			couponId: coupon,
		}
	}, [currentSeasonQueryDocumentSnapshot, isReturningPlayer])

	// Check if season has Stripe configuration
	const isSeasonConfigured = Boolean(priceId)

	const registrationButtonOnClickHandler = useCallback(() => {
		if (!priceId) {
			setStripeError(
				'Season payment not configured. Please contact an administrator.'
			)
			return
		}

		stripeRegistration(authStateUser, setStripeLoading, setStripeError, {
			priceId,
			couponId: couponId ?? undefined,
		})
	}, [authStateUser, priceId, couponId])

	// Check if registration hasn't started yet (different from registration ended)
	const isRegistrationNotStarted = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot) return false
		const now = Timestamp.now()
		const registrationStart =
			currentSeasonQueryDocumentSnapshot.data().registrationStart
		return now < registrationStart
	}, [currentSeasonQueryDocumentSnapshot])

	// Check if registration has ended
	const isRegistrationEnded = useMemo(() => {
		if (!currentSeasonQueryDocumentSnapshot) return false
		const now = Timestamp.now()
		const registrationEnd =
			currentSeasonQueryDocumentSnapshot.data().registrationEnd
		return now > registrationEnd
	}, [currentSeasonQueryDocumentSnapshot])

	// For non-admin users, disable button if registration hasn't started yet or has ended
	// For admin users, always allow payment regardless of registration dates
	const isPaymentDisabled =
		!isAuthenticatedUserAdmin &&
		(isRegistrationNotStarted || isRegistrationEnded)
	const isUserBanned = isAuthenticatedUserBanned

	return (
		<div className='space-y-3'>
			<h3 className='font-medium text-sm'>Registration Payment</h3>

			{isLoading || isAuthenticatedUserPaid === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking payment status...
				</div>
			) : isAuthenticatedUserPaid ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-600 dark:!text-green-400' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Registration payment completed successfully.
					</AlertDescription>
				</Alert>
			) : (
				<div className='space-y-3'>
					{isUserBanned ? (
						<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
							<AlertCircle className='h-4 w-4 !text-red-600 dark:!text-red-400' />
							<AlertDescription className='!text-red-800 dark:!text-red-200'>
								Account has been banned from Minneapolis Winter League.
							</AlertDescription>
						</Alert>
					) : isRegistrationNotStarted && !isAuthenticatedUserAdmin ? (
						<Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
							<Calendar className='h-4 w-4 !text-blue-600 dark:!text-blue-400' />
							<AlertDescription className='!text-blue-800 dark:!text-blue-200'>
								Registration opens on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationStart
								)}
							</AlertDescription>
						</Alert>
					) : isRegistrationEnded && !isAuthenticatedUserAdmin ? (
						<Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
							<Calendar className='h-4 w-4 !text-blue-600 dark:!text-blue-400' />
							<AlertDescription className='!text-blue-800 dark:!text-blue-200'>
								Registration ended on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationEnd
								)}
							</AlertDescription>
						</Alert>
					) : !isSeasonConfigured ? (
						<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
							<AlertCircle className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
							<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
								Season payment is not yet configured. Please contact an
								administrator.
							</AlertDescription>
						</Alert>
					) : (
						<Alert className='border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'>
							<CreditCard className='h-4 w-4 !text-slate-600 dark:!text-slate-400' />
							<AlertDescription className='!text-slate-700 dark:!text-slate-300'>
								Complete registration by paying via Stripe.
							</AlertDescription>
						</Alert>
					)}

					{/* Returning player discount badge */}
					{isReturningPlayer && couponId && isSeasonConfigured && (
						<Badge
							variant='outline'
							className='gap-1 w-fit border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200'
						>
							<Tag className='h-3 w-3' />
							Returning player discount will be applied
						</Badge>
					)}

					<Button
						onClick={registrationButtonOnClickHandler}
						disabled={
							isPaymentDisabled ||
							stripeLoading ||
							isUserBanned ||
							!isSeasonConfigured
						}
						className='w-full'
					>
						{stripeLoading ? (
							<LoadingSpinner size='sm' className='mr-2' />
						) : (
							<CreditCard className='mr-2 h-4 w-4' />
						)}
						{stripeLoading ? 'Processing...' : 'Pay via Stripe'}
					</Button>
				</div>
			)}
		</div>
	)
}
