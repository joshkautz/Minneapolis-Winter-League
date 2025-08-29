import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'
import { stripeRegistration } from '@/firebase/firestore'
import { formatTimestamp } from '@/shared/utils'
import { User } from 'firebase/auth'
import { QueryDocumentSnapshot, DocumentData } from '@/firebase/firestore'
import { SeasonDocument } from '@/shared/utils'

interface PaymentSectionProps {
	authStateUser: User | null | undefined
	isLoading: boolean
	isRegistrationOpen: boolean | undefined
	isAuthenticatedUserAdmin: boolean
	isAuthenticatedUserBanned: boolean
	isAuthenticatedUserPaid: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument, DocumentData>
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
	isRegistrationOpen,
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

	return (
		<fieldset className={'space-y-2'}>
			<Label className={'inline-flex'}>
				Payment
				{isLoading || isAuthenticatedUserPaid === undefined ? (
					<></>
				) : isAuthenticatedUserPaid ? (
					<CheckCircledIcon className={'w-4 h-4 ml-1'} />
				) : (
					<span className={'relative flex w-2 h-2 ml-1'}>
						<span
							className={'relative inline-flex w-2 h-2 rounded-full bg-primary'}
						/>
					</span>
				)}
			</Label>

			<div>
				{isLoading || isAuthenticatedUserPaid === undefined ? (
					<div className={'inline-flex items-center gap-2'}>Loading...</div>
				) : isAuthenticatedUserPaid ? (
					<></>
				) : (
					<>
						<Button
							variant={'default'}
							onClick={registrationButtonOnClickHandler}
							disabled={
								(!isRegistrationOpen && !isAuthenticatedUserAdmin) ||
								stripeLoading ||
								isAuthenticatedUserBanned
							}
						>
							{stripeLoading && (
								<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
							)}
							Pay via Stripe
						</Button>

						{!isRegistrationOpen && !isAuthenticatedUserAdmin ? (
							<p className={'text-[0.8rem] text-muted-foreground mt-2'}>
								Registration opens on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationStart
								)}
							</p>
						) : isAuthenticatedUserBanned ? (
							<p
								className={
									'text-[0.8rem] text-muted-foreground mt-2 text-red-500'
								}
							>
								Account has been regrettably suspended or banned from
								Minneapolis Winter League.
							</p>
						) : (
							<p className={'text-[0.8rem] text-muted-foreground mt-2'}>
								Complete registration by paying via Stripe. This may take a few
								seconds to process.
							</p>
						)}
					</>
				)}
			</div>
		</fieldset>
	)
}
