import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import { CheckCircle, Mail } from 'lucide-react'
import { useEmailVerification } from './use-email-verification'

interface EmailVerificationSectionProps {
	isVerified: boolean | undefined
	isLoading: boolean
	isAuthenticatedUserBanned: boolean
}

/**
 * EmailVerificationSection Component
 *
 * Handles email verification functionality with improved status indicators
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
		<div className='space-y-3'>
			<h3 className='font-medium text-sm'>Email Verification</h3>

			{isLoading || isVerified === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking verification status...
				</div>
			) : isVerified ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-600 dark:!text-green-400' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Your email address has been verified successfully.
					</AlertDescription>
				</Alert>
			) : (
				<div className='space-y-3'>
					<Alert className='border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'>
						<Mail className='h-4 w-4 !text-slate-600 dark:!text-slate-400' />
						<AlertDescription className='!text-slate-700 dark:!text-slate-300'>
							Please verify your email address to access all features.
						</AlertDescription>
					</Alert>

					<Button
						variant='outline'
						size='sm'
						onClick={handleSendVerification}
						disabled={
							verificationEmailSent ||
							verificationEmailLoading ||
							isAuthenticatedUserBanned
						}
						className='w-full'
					>
						{verificationEmailLoading && (
							<LoadingSpinner size='sm' className='mr-2' />
						)}
						<Mail className='mr-2 h-3 w-3' />
						{verificationEmailSent
							? 'Verification Email Sent!'
							: 'Send Verification Email'}
					</Button>

					{verificationEmailSent && (
						<p className='text-xs text-muted-foreground text-center'>
							Check your email inbox and click the verification link. Check your
							spam folder if you don't see it.
						</p>
					)}
				</div>
			)}
		</div>
	)
}
