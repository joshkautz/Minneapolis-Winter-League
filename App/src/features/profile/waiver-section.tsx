import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'
import { sendDropboxEmail } from '@/firebase/functions'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'
import { formatTimestamp, SeasonDocument } from '@/shared/utils'
import { QueryDocumentSnapshot, DocumentData } from '@/firebase/firestore'

interface WaiverSectionProps {
	isAuthenticatedUserSigned: boolean | undefined
	isLoading: boolean
	isRegistrationOpen: boolean | undefined
	isAuthenticatedUserAdmin: boolean | undefined
	isAuthenticatedUserPaid: boolean | undefined
	isAuthenticatedUserBanned: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument, DocumentData>
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
						/>
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
						<span className='inline-flex items-center'>
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
