import { useState, useCallback } from 'react'
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
import { sendDropboxEmail } from '@/firebase/functions'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'
import { formatTimestamp, SeasonDocument } from '@/shared/utils'
import { QueryDocumentSnapshot } from '@/firebase/firestore'

interface WaiverSectionProps {
	isAuthenticatedUserSigned: boolean | undefined
	isLoading: boolean
	isRegistrationOpen: boolean | undefined
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
	isRegistrationOpen,
	isAuthenticatedUserAdmin,
	isAuthenticatedUserPaid,
	isAuthenticatedUserBanned,
	currentSeasonQueryDocumentSnapshot,
}: WaiverSectionProps) => {
	const [dropboxEmailSent, setDropboxEmailSent] = useState(false)
	const [dropboxEmailLoading, setDropboxEmailLoading] = useState(false)

	const sendDropboxEmailButtonOnClickHandler = useCallback(() => {
		setDropboxEmailLoading(true)
		sendDropboxEmail()
			.then((result) => {
				const data: returnTypeT<SignatureRequestGetResponse> = result.data
				setDropboxEmailSent(true)
				setDropboxEmailLoading(false)
				toast.success('Success', {
					description: `Email sent to ${data.body.signatureRequest?.requesterEmailAddress}`,
				})
			})
			.catch((error) => {
				console.error('Dropbox error:', error)
				setDropboxEmailSent(false)
				setDropboxEmailLoading(false)

				// Handle both HttpError from Dropbox SDK and other errors
				let errorMessage = 'An unknown error occurred'

				if (error?.code === 'functions/unknown' && error?.details) {
					// Firebase Functions wrapped the HttpError
					errorMessage = `Dropbox Error: ${error.details.body?.error?.errorMsg || error.message}`
				} else if (error?.body?.error) {
					// Direct HttpError from Dropbox
					errorMessage = `Dropbox Error: ${error.body.error.errorMsg}`
				} else if (error?.message) {
					errorMessage = error.message
				}

				toast.error('Failure', {
					description: errorMessage,
				})
			})
	}, [])

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

	const isRegistrationClosed = !isRegistrationOpen && !isAuthenticatedUserAdmin
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
					) : isRegistrationClosed ? (
						<Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
							<Calendar className='h-4 w-4 !text-blue-800 dark:!text-blue-200' />
							<AlertDescription className='!text-blue-800 dark:!text-blue-200'>
								Registration opens on{' '}
								{formatTimestamp(
									currentSeasonQueryDocumentSnapshot?.data().registrationStart
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
							isRegistrationClosed ||
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
