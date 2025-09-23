import { EmailVerificationSection } from './email-verification-section'
import { PaymentSection } from './payment-section'
import { WaiverSection } from './waiver-section'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { User } from 'firebase/auth'
import { QueryDocumentSnapshot } from '@/firebase/firestore'
import { SeasonDocument } from '@/shared/utils'
import { Settings } from 'lucide-react'

interface ProfileActionsProps {
	authStateUser: User | null | undefined
	isVerified: boolean | undefined
	isLoading: boolean
	isRegistrationOpen: boolean | undefined
	isAuthenticatedUserAdmin: boolean
	isAuthenticatedUserBanned: boolean
	isAuthenticatedUserPaid: boolean
	isAuthenticatedUserSigned: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
}

/**
 * ProfileActions Component
 *
 * Container component for all profile action sections
 * (email verification, payment, waiver)
 */
export const ProfileActions = ({
	authStateUser,
	isVerified,
	isLoading,
	isRegistrationOpen,
	isAuthenticatedUserAdmin,
	isAuthenticatedUserBanned,
	isAuthenticatedUserPaid,
	isAuthenticatedUserSigned,
	currentSeasonQueryDocumentSnapshot,
}: ProfileActionsProps) => {
	return (
		<Card className='h-fit'>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Settings className='h-5 w-5' />
					Account Actions
				</CardTitle>
				<CardDescription>
					Complete required tasks and manage your account status
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='flex flex-col gap-6'>
					<EmailVerificationSection
						isVerified={isVerified}
						isLoading={isLoading}
						isAuthenticatedUserBanned={isAuthenticatedUserBanned}
					/>

					<PaymentSection
						authStateUser={authStateUser}
						isAuthenticatedUserPaid={isAuthenticatedUserPaid}
						isLoading={isLoading}
						isRegistrationOpen={isRegistrationOpen}
						isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
						isAuthenticatedUserBanned={isAuthenticatedUserBanned}
						currentSeasonQueryDocumentSnapshot={
							currentSeasonQueryDocumentSnapshot
						}
					/>

					<WaiverSection
						isAuthenticatedUserSigned={isAuthenticatedUserSigned}
						isLoading={isLoading}
						isRegistrationOpen={isRegistrationOpen}
						isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
						isAuthenticatedUserPaid={isAuthenticatedUserPaid}
						isAuthenticatedUserBanned={isAuthenticatedUserBanned}
						currentSeasonQueryDocumentSnapshot={
							currentSeasonQueryDocumentSnapshot
						}
					/>
				</div>
			</CardContent>
		</Card>
	)
}
