import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'
import { sendDropboxEmail } from '@/firebase/functions'
import {
	DropboxError,
	DropboxResult,
	formatTimestamp,
	SeasonData,
} from '@/shared/utils'
import { QueryDocumentSnapshot, DocumentData } from '@/firebase/firestore'

interface WaiverSectionProps {
	isAuthenticatedUserSigned: boolean | undefined
	isLoading: boolean
	isRegistrationOpen: boolean | undefined
	isAuthenticatedUserAdmin: boolean | undefined
	isAuthenticatedUserPaid: boolean | undefined
	isAuthenticatedUserBanned: boolean | undefined
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
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
		sendDropboxEmail().then((result) => {
			if ('result' in result.data) {
				const data: DropboxResult = result.data as DropboxResult
				setDropboxEmailSent(true)
				setDropboxEmailLoading(false)
				toast.success('Success', {
					description: `Email sent to ${data.result.requesterEmailAddress}`,
				})
			}

			if ('error' in result.data) {
				const data: DropboxError = result.data as DropboxError
				setDropboxEmailSent(false)
				setDropboxEmailLoading(false)
				toast.error('Failure', {
					description: `Dropbox Error: ${data.error.message}`,
				})
			}
		})
	}, [])

	return (
		<fieldset className={'space-y-2'}>
			<Label className={'inline-flex'}>
				Waiver
				{isLoading || isAuthenticatedUserSigned === undefined ? (
					<></>
				) : isAuthenticatedUserSigned ? (
					<CheckCircledIcon className={'w-4 h-4 ml-1'} />
				) : (
					<span className={'relative flex w-2 h-2 ml-1'}>
						<span
							className={'relative inline-flex w-2 h-2 rounded-full bg-primary'}
						></span>
					</span>
				)}
			</Label>

			<div>
				{isLoading || isAuthenticatedUserSigned === undefined ? (
					<div className={'inline-flex items-center gap-2'}>Loading...</div>
				) : isAuthenticatedUserSigned ? (
					<></>
				) : (
					<>
						<span className="inline-flex items-center">
							<Button
								variant={'default'}
								onClick={sendDropboxEmailButtonOnClickHandler}
								disabled={
									(!isRegistrationOpen && !isAuthenticatedUserAdmin) ||
									dropboxEmailLoading ||
									dropboxEmailSent ||
									!isAuthenticatedUserPaid ||
									isAuthenticatedUserBanned
								}
							>
								{dropboxEmailLoading && (
									<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
								)}
								{dropboxEmailSent ? 'Email Sent!' : 'Re-Send Waiver Email'}
							</Button>
						</span>

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
								Check your email for a Dropbox Sign link. Waiver will be sent
								after payment.
							</p>
						)}
					</>
				)}
			</div>
		</fieldset>
	)
}
