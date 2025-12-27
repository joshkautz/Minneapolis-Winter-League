import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import { CheckCircle, FileText, AlertCircle, Calendar } from 'lucide-react'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'
import { formatTimestamp, SeasonDocument, logger } from '@/shared/utils'
import { QueryDocumentSnapshot } from '@/firebase'
import { Timestamp } from '@firebase/firestore'
import { sendDropboxEmail } from '@/firebase/functions'

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

	const sendDropboxEmailButtonOnClickHandler = useCallback(async () => {
		setDropboxEmailLoading(true)

		try {
			// The backend function will automatically look up the user's waiver
			const result = await sendDropboxEmail()
			const data: returnTypeT<SignatureRequestGetResponse> = result.data

			setDropboxEmailSent(true)
			setDropboxEmailLoading(false)
			toast.success('Success', {
				description: `Email sent to ${data.body.signatureRequest?.requesterEmailAddress}`,
			})
		} catch (error) {
			logger.error('Dropbox waiver email error', error, {
				component: 'WaiverSection',
				action: 'send_dropbox_email',
			})
			setDropboxEmailSent(false)
			setDropboxEmailLoading(false)

			// Handle both HttpError from Dropbox SDK and other errors
			let errorMessage = 'An unknown error occurred'

			// Type guard for Firebase Functions error with details
			interface FirebaseFunctionsError {
				code: string
				details?: {
					body?: { error?: { errorMsg?: string } }
				}
				message?: string
			}

			// Type guard for Dropbox HttpError
			interface DropboxHttpError {
				body?: { error?: { errorMsg?: string } }
			}

			const isFirebaseFunctionsError = (
				err: unknown
			): err is FirebaseFunctionsError =>
				typeof err === 'object' &&
				err !== null &&
				'code' in err &&
				(err as FirebaseFunctionsError).code === 'functions/unknown'

			const isDropboxHttpError = (err: unknown): err is DropboxHttpError =>
				typeof err === 'object' &&
				err !== null &&
				'body' in err &&
				typeof (err as DropboxHttpError).body === 'object'

			if (isFirebaseFunctionsError(error)) {
				// Firebase Functions wrapped the HttpError
				errorMessage = `Dropbox Error: ${error.details?.body?.error?.errorMsg || error.message}`
			} else if (isDropboxHttpError(error)) {
				// Direct HttpError from Dropbox
				errorMessage = `Dropbox Error: ${error.body?.error?.errorMsg}`
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			toast.error('Failure', {
				description: errorMessage,
			})
		}
	}, [])

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
	// const isWaiverDisabled =
	// 	!isAuthenticatedUserAdmin &&
	// 	(isRegistrationNotStarted || isRegistrationEnded)
	const isUserBanned = isAuthenticatedUserBanned
	const needsPayment = !isAuthenticatedUserPaid

	return (
		<div className='space-y-3'>
			<h3 className='font-medium text-sm'>Waiver Signature</h3>

			{isLoading || isAuthenticatedUserSigned === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking waiver status...
				</div>
			) : isAuthenticatedUserSigned ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-600 dark:!text-green-400' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Liability waiver has been signed successfully.
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
					) : needsPayment ? (
						<Alert className='border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'>
							<AlertCircle className='h-4 w-4 !text-slate-600 dark:!text-slate-400' />
							<AlertDescription className='!text-slate-700 dark:!text-slate-300'>
								Complete payment first to receive the waiver signing link.
							</AlertDescription>
						</Alert>
					) : (
						<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
							<FileText className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
							<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
								Sign the liability waiver to complete registration.
							</AlertDescription>
						</Alert>
					)}

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className='w-full'>
									<Button
										onClick={sendDropboxEmailButtonOnClickHandler}
										disabled={true}
										className='w-full'
									>
										{dropboxEmailLoading ? (
											<LoadingSpinner size='sm' className='mr-2' />
										) : (
											<FileText className='mr-2 h-4 w-4' />
										)}
										{dropboxEmailSent
											? 'Waiver Email Resent!'
											: 'Resend Waiver Email'}
									</Button>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								<p>
									Dropbox Sign is currently experiencing instability. Upon
									payment, you will automatically be sent a waiver email. Please
									patiently check your inbox or spam.
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

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
