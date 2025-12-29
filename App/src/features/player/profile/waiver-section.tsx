import { useState, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import { CheckCircle, FileText, AlertCircle, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import {
	formatTimestamp,
	SeasonDocument,
	logger,
	extractErrorMessage,
} from '@/shared/utils'
import { QueryDocumentSnapshot } from '@/firebase'
import { Timestamp } from '@firebase/firestore'
import { sendWaiverReminderEmail } from '@/firebase/functions'

/** Rate limit cooldown in milliseconds (5 minutes) */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000

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
	const [cooldownRemaining, setCooldownRemaining] = useState(0)

	// Countdown timer for rate limiting
	useEffect(() => {
		if (cooldownRemaining <= 0) return

		const timer = setInterval(() => {
			setCooldownRemaining((prev) => Math.max(0, prev - 1000))
		}, 1000)

		return () => clearInterval(timer)
	}, [cooldownRemaining])

	const sendWaiverReminderHandler = useCallback(async () => {
		setDropboxEmailLoading(true)

		try {
			// The backend function will automatically look up the user's waiver
			await sendWaiverReminderEmail()

			setDropboxEmailSent(true)
			setDropboxEmailLoading(false)
			setCooldownRemaining(RESEND_COOLDOWN_MS)
			toast.success('Waiver Email Sent', {
				description: 'Check your inbox for the waiver signing link.',
			})
		} catch (error) {
			logger.error('Dropbox waiver email error', error, {
				component: 'WaiverSection',
				action: 'send_dropbox_email',
			})
			setDropboxEmailSent(false)
			setDropboxEmailLoading(false)

			toast.error('Failed to Send Email', {
				description: extractErrorMessage(error),
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

	const isUserBanned = isAuthenticatedUserBanned
	const needsPayment = !isAuthenticatedUserPaid
	const isOnCooldown = cooldownRemaining > 0

	// Compute whether the resend button should be disabled
	const isResendDisabled =
		isUserBanned ||
		needsPayment ||
		dropboxEmailLoading ||
		isOnCooldown ||
		(!isAuthenticatedUserAdmin &&
			(isRegistrationNotStarted || isRegistrationEnded))

	// Format cooldown remaining as M:SS
	const formatCooldown = (ms: number): string => {
		const totalSeconds = Math.ceil(ms / 1000)
		const minutes = Math.floor(totalSeconds / 60)
		const seconds = totalSeconds % 60
		return `${minutes}:${seconds.toString().padStart(2, '0')}`
	}

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

					<Button
						onClick={sendWaiverReminderHandler}
						disabled={isResendDisabled}
						className='w-full'
					>
						{dropboxEmailLoading ? (
							<LoadingSpinner size='sm' className='mr-2' />
						) : (
							<FileText className='mr-2 h-4 w-4' />
						)}
						{isOnCooldown
							? `Resend in ${formatCooldown(cooldownRemaining)}`
							: 'Resend Waiver Email'}
					</Button>

					{dropboxEmailSent && !isOnCooldown && (
						<p className='text-xs text-muted-foreground text-center'>
							Check your email for the Dropbox Sign waiver link.
						</p>
					)}
				</div>
			)}
		</div>
	)
}
