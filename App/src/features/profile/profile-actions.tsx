import { EmailVerificationSection } from './email-verification-section'
import { PaymentSection } from './payment-section'
import { WaiverSection } from './waiver-section'
import { User } from 'firebase/auth'
import { QueryDocumentSnapshot, DocumentData } from '@/firebase/firestore'
import { SeasonData } from '@/shared/utils'

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
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
	sendEmailVerification: () => Promise<boolean>
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
	sendEmailVerification,
}: ProfileActionsProps) => {
	return (
		<div className={'max-w-(--breakpoint-md) flex-1 basis-[300px] shrink-0'}>
			<p className='mb-4 text-xl font-bold'>Actions</p>
			<div className={'flex flex-col gap-6'}>
				<EmailVerificationSection
					isVerified={isVerified}
					isLoading={isLoading}
					isAuthenticatedUserBanned={isAuthenticatedUserBanned}
					sendEmailVerification={sendEmailVerification}
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
		</div>
	)
}
