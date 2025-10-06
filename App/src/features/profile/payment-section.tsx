import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { User } from 'firebase/auth'
import { Timestamp } from '@firebase/firestore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import {
	CheckCircle,
	Clock,
	CreditCard,
	AlertCircle,
	Calendar,
} from 'lucide-react'
import { stripeRegistration, QueryDocumentSnapshot } from '@/firebase/firestore'
import { formatTimestamp, SeasonDocument } from '@/shared/utils'

interface PaymentSectionProps {
	authStateUser: User | null | undefined
	isLoading: boolean
	isAuthenticatedUserAdmin: boolean
	isAuthenticatedUserBanned: boolean
	isAuthenticatedUserPaid: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
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
}: PaymentSectionProps) => {
	const [stripeLoading, setStripeLoading] = useState<boolean>(false)
	const [stripeError, setStripeError] = useState<string>()

	useEffect(() => {
		if (stripeError) {
			toast.error('Failure', {
				description: stripeError,
			})
			setStripeError(undefined)
		}
	}, [stripeError])

	const registrationButtonOnClickHandler = useCallback(() => {
		stripeRegistration(authStateUser, setStripeLoading, setStripeError)
	}, [authStateUser])

	const getStatusBadge = () => {
		if (isLoading || isAuthenticatedUserPaid === undefined) {
			return (
				<Badge variant='outline' className='gap-1'>
					<Clock className='h-3 w-3' />
					Loading...
				</Badge>
			)
		}

		if (isAuthenticatedUserPaid) {
			return (
				<Badge variant='successful' className='gap-1'>
					<CheckCircle className='h-3 w-3' />
					Paid
				</Badge>
			)
		}

		return (
			<Badge variant='destructive' className='gap-1'>
				<CreditCard className='h-3 w-3' />
				Payment Required
			</Badge>
		)
	}

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
			<div className='flex items-center justify-between'>
				<h3 className='font-medium text-sm'>Registration Payment</h3>
				{getStatusBadge()}
			</div>

			{isLoading || isAuthenticatedUserPaid === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking payment status...
				</div>
			) : isAuthenticatedUserPaid ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-800 dark:!text-green-200' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Registration payment completed successfully.
					</AlertDescription>
				</Alert>
			) : (
				<div className='space-y-3'>
					{isUserBanned ? (
						<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
							<AlertCircle className='h-4 w-4 !text-red-800 dark:!text-red-200' />
							<AlertDescription className='!text-red-800 dark:!text-red-200'>
								Account has been banned from Minneapolis Winter League.
							</AlertDescription>
						</Alert>
					) : isRegistrationNotStarted && !isAuthenticatedUserAdmin ? (
						<Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
							<Calendar className='h-4 w-4 !text-blue-800 dark:!text-blue-200' />
							<AlertDescription className='!text-blue-800 dark:!text-blue-200'>
								Registration opens on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationStart
								)}
							</AlertDescription>
						</Alert>
					) : isRegistrationEnded && !isAuthenticatedUserAdmin ? (
						<Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
							<Calendar className='h-4 w-4 !text-blue-800 dark:!text-blue-200' />
							<AlertDescription className='!text-blue-800 dark:!text-blue-200'>
								Registration ended on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationEnd
								)}
							</AlertDescription>
						</Alert>
					) : (
						<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
							<CreditCard className='h-4 w-4 !text-red-800 dark:!text-red-200' />
							<AlertDescription className='!text-red-800 dark:!text-red-200'>
								Complete registration by paying via Stripe.
							</AlertDescription>
						</Alert>
					)}

					<Button
						onClick={registrationButtonOnClickHandler}
						disabled={isPaymentDisabled || stripeLoading || isUserBanned}
						className='w-full'
					>
						{stripeLoading ? (
							<LoadingSpinner size='sm' className='mr-2' />
						) : (
							<CreditCard className='mr-2 h-4 w-4' />
						)}
						{stripeLoading ? 'Processing...' : 'Pay via Stripe'}
					</Button>

					{!isPaymentDisabled && !isUserBanned && (
						<p className='text-xs text-muted-foreground text-center'>
							Payment processing may take a few seconds to complete.
						</p>
					)}
				</div>
			)}
		</div>
	)
}
