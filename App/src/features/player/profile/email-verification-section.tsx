import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/shared/components'
import { CheckCircle, Clock, Mail } from 'lucide-react'
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

	const getStatusBadge = () => {
		if (isLoading || isVerified === undefined) {
			return (
				<Badge variant='outline' className='gap-1'>
					<Clock className='h-3 w-3' />
					Loading...
				</Badge>
			)
		}

		if (isVerified) {
			return (
				<Badge variant='successful' className='gap-1'>
					<CheckCircle className='h-3 w-3' />
					Verified
				</Badge>
			)
		}

		return (
			<Badge variant='destructive' className='gap-1'>
				<Mail className='h-3 w-3' />
				Verification Required
			</Badge>
		)
	}

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='font-medium text-sm'>Email Verification</h3>
				{getStatusBadge()}
			</div>

			{isLoading || isVerified === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking verification status...
				</div>
			) : isVerified ? (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 !text-green-800 dark:!text-green-200' />
					<AlertDescription className='!text-green-800 dark:!text-green-200'>
						Your email address has been verified successfully.
					</AlertDescription>
				</Alert>
			) : (
				<div className='space-y-3'>
					<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
						<Mail className='h-4 w-4 !text-red-800 dark:!text-red-200' />
						<AlertDescription className='!text-red-800 dark:!text-red-200'>
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
