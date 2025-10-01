import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import {
	CheckCircle,
	Clock,
	FileText,
	AlertCircle,
	Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'
import {
	formatTimestamp,
	SeasonDocument,
	Collections,
	WaiverDocument,
} from '@/shared/utils'
import { QueryDocumentSnapshot } from '@/firebase/firestore'
import { Timestamp } from '@firebase/firestore'
import { sendDropboxEmail } from '@/firebase/functions'
import { useAuthContext } from '@/providers'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { firestore } from '@/firebase/app'
import { getPlayerRef } from '@/firebase/collections/players'

interface WaiverSectionProps {
	isAuthenticatedUserSigned: boolean | undefined
	isLoading: boolean
	isAuthenticatedUserAdmin: boolean | undefined
	isAuthenticatedUserPaid: boolean | undefined
	isAuthenticatedUserBanned: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
}

/**
 * WaiverSection Component
 *
 * Handles waiver signing functionality via Dropbox Sign
 * Extracted from main Profile component for better separation of concerns
 */
export const WaiverSection = ({
	isAuthenticatedUserSigned,
	isLoading,
	isAuthenticatedUserAdmin,
	isAuthenticatedUserPaid,
	isAuthenticatedUserBanned,
	currentSeasonQueryDocumentSnapshot,
}: WaiverSectionProps) => {
	const [dropboxEmailSent, setDropboxEmailSent] = useState(false)
	const [dropboxEmailLoading, setDropboxEmailLoading] = useState(false)
	const { authStateUser } = useAuthContext()

	const sendDropboxEmailButtonOnClickHandler = useCallback(async () => {
		if (!authStateUser?.uid || !currentSeasonQueryDocumentSnapshot) {
			toast.error('Failure', {
				description: 'User not authenticated or season not loaded',
			})
			return
		}

		setDropboxEmailLoading(true)

		try {
			// Get the player document reference
			const playerRef = getPlayerRef(authStateUser)

			if (!playerRef) {
				throw new Error('Could not get player reference')
			}

			// Query for the user's waiver for the current season
			const waiverQuery = query(
				collection(firestore, Collections.WAIVERS),
				where('player', '==', playerRef),
				limit(1)
			)

			const waiverSnapshot = await getDocs(waiverQuery)

			if (waiverSnapshot.empty) {
				throw new Error('No waiver found for this user')
			}

			const waiverData = waiverSnapshot.docs[0].data() as WaiverDocument

			if (!waiverData.signatureRequestId) {
				throw new Error('Waiver does not have a signature request ID')
			}

			// Send the reminder email with the signature request ID
			const result = await sendDropboxEmail(waiverData.signatureRequestId)
			const data: returnTypeT<SignatureRequestGetResponse> = result.data

			setDropboxEmailSent(true)
			setDropboxEmailLoading(false)
			toast.success('Success', {
				description: `Email sent to ${data.body.signatureRequest?.requesterEmailAddress}`,
			})
		} catch (error) {
			console.error('Dropbox error:', error)
			setDropboxEmailSent(false)
			setDropboxEmailLoading(false)

			// Handle both HttpError from Dropbox SDK and other errors
			let errorMessage = 'An unknown error occurred'

			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'functions/unknown' &&
				'details' in error
			) {
				// Firebase Functions wrapped the HttpError
				const details = error.details as any
				errorMessage = `Dropbox Error: ${details?.body?.error?.errorMsg || (error as any).message}`
			} else if (
				typeof error === 'object' &&
				error !== null &&
				'body' in error &&
				typeof (error as any).body === 'object'
			) {
				// Direct HttpError from Dropbox
				const body = (error as any).body
				errorMessage = `Dropbox Error: ${body?.error?.errorMsg}`
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			toast.error('Failure', {
				description: errorMessage,
			})
		}
	}, [authStateUser, currentSeasonQueryDocumentSnapshot])

	const getStatusBadge = () => {
		if (isLoading || isAuthenticatedUserSigned === undefined) {
			return (
				<Badge variant='outline' className='gap-1'>
					<Clock className='h-3 w-3' />
					Loading...
				</Badge>
			)
		}

		if (isAuthenticatedUserSigned) {
			return (
				<Badge variant='successful' className='gap-1'>
					<CheckCircle className='h-3 w-3' />
					Signed
				</Badge>
			)
		}

		return (
			<Badge variant='destructive' className='gap-1'>
				<FileText className='h-3 w-3' />
				Signature Required
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

	// For non-admin users, disable waiver actions if registration hasn't started yet or has ended
	// For admin users, always allow waiver actions regardless of registration dates
	const isWaiverDisabled =
		!isAuthenticatedUserAdmin &&
		(isRegistrationNotStarted || isRegistrationEnded)
	const isUserBanned = isAuthenticatedUserBanned
	const needsPayment = !isAuthenticatedUserPaid

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='font-medium text-sm'>Waiver Signature</h3>
				{getStatusBadge()}
			</div>

			{isLoading || isAuthenticatedUserSigned === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking waiver status...
				</div>
			) : isAuthenticatedUserSigned ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-800 dark:!text-green-200' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Liability waiver has been signed successfully.
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
					) : needsPayment ? (
						<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
							<AlertCircle className='h-4 w-4 !text-red-800 dark:!text-red-200' />
							<AlertDescription className='!text-red-800 dark:!text-red-200'>
								Complete payment first to receive the waiver signing link.
							</AlertDescription>
						</Alert>
					) : (
						<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
							<FileText className='h-4 w-4 !text-amber-800 dark:!text-amber-200' />
							<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
								Sign the liability waiver to complete registration.
							</AlertDescription>
						</Alert>
					)}

					<Button
						onClick={sendDropboxEmailButtonOnClickHandler}
						disabled={
							isWaiverDisabled ||
							dropboxEmailLoading ||
							dropboxEmailSent ||
							needsPayment ||
							isUserBanned
						}
						className='w-full'
					>
						{dropboxEmailLoading ? (
							<LoadingSpinner size='sm' className='mr-2' />
						) : (
							<FileText className='mr-2 h-4 w-4' />
						)}
						{dropboxEmailSent ? 'Waiver Email Sent!' : 'Send Waiver Email'}
					</Button>

					{dropboxEmailSent && (
						<p className='text-xs text-muted-foreground text-center'>
							Check your email for the Dropbox Sign waiver link.
						</p>
					)}
				</div>
			)}
		</div>
	)
}
