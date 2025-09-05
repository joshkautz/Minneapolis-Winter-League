import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircledIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useEmailVerification } from './use-email-verification'

interface EmailVerificationSectionProps {
	isVerified: boolean | undefined
	isLoading: boolean
	isAuthenticatedUserBanned: boolean
}

/**
 * EmailVerificationSection Component
 *
 * Handles email verification functionality
 * Extracted from main Profile component for better separation of concerns
 */
export const EmailVerificationSection = ({
	isVerified,
	isLoading,
	isAuthenticatedUserBanned,
}: EmailVerificationSectionProps) => {
	const {
		handleSendVerification,
		isLoading: verificationEmailLoading,
		verificationEmailSent,
	} = useEmailVerification({ isAuthenticatedUserBanned })

	return (
		<fieldset className={'space-y-2'}>
			<Label className={'inline-flex'}>
				Email Verification
				{isLoading ? (
					// loading state, pulse animation
					<></>
				) : isVerified ? (
					// action completed, checkIcon
					<CheckCircledIcon className={'w-4 h-4 ml-1'} />
				) : (
					// action needed, solid dot
					<span className={'relative flex w-2 h-2 ml-1'}>
						<span
							className={'relative inline-flex w-2 h-2 rounded-full bg-primary'}
						/>
					</span>
				)}
			</Label>

			<div>
				{isLoading || isVerified === undefined ? (
					<div className={'inline-flex items-center gap-2'}>Loading...</div>
				) : isVerified ? (
					<></>
				) : (
					<>
						<Button
							variant={'default'}
							onClick={handleSendVerification}
							disabled={
								verificationEmailSent ||
								verificationEmailLoading ||
								isAuthenticatedUserBanned
							}
						>
							{verificationEmailLoading && (
								<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
							)}
							{verificationEmailSent
								? 'Email Sent!'
								: 'Re-Send Verification Email'}
						</Button>
						<p className={'text-[0.8rem] text-muted-foreground mt-2'}>
							Check your email for a verification link.
						</p>
					</>
				)}
			</div>
		</fieldset>
	)
}
