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
import {
	QueryDocumentSnapshot,
	QuerySnapshot,
	DocumentSnapshot,
} from '@/firebase'
import { SeasonDocument } from '@/shared/utils'
import { Settings } from 'lucide-react'
import type { PlayerDocument } from '@/types'

interface ProfileActionsProps {
	authStateUser: User | null | undefined
	isVerified: boolean | undefined
	isLoading: boolean
	isAuthenticatedUserAdmin: boolean
	isAuthenticatedUserBanned: boolean
	isAuthenticatedUserPaid: boolean
	isAuthenticatedUserSigned: boolean
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
	/** Player document snapshot for checking previous season payment */
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
	/** All seasons snapshot for determining previous season */
	seasonsQuerySnapshot: QuerySnapshot<SeasonDocument> | undefined
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
	isAuthenticatedUserAdmin,
	isAuthenticatedUserBanned,
	isAuthenticatedUserPaid,
	isAuthenticatedUserSigned,
	currentSeasonQueryDocumentSnapshot,
	authenticatedUserSnapshot,
	seasonsQuerySnapshot,
}: ProfileActionsProps) => {
	return (
		<Card className='h-fit'>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Settings className='h-5 w-5' />
					Profile Actions
				</CardTitle>
				<CardDescription>
					Complete required tasks and manage your account status
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='space-y-6'>
					<EmailVerificationSection
						isVerified={isVerified}
						isLoading={isLoading}
						isAuthenticatedUserBanned={isAuthenticatedUserBanned}
					/>

					<div className='border-t pt-6'>
						<PaymentSection
							authStateUser={authStateUser}
							isAuthenticatedUserPaid={isAuthenticatedUserPaid}
							isLoading={isLoading}
							isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
							isAuthenticatedUserBanned={isAuthenticatedUserBanned}
							currentSeasonQueryDocumentSnapshot={
								currentSeasonQueryDocumentSnapshot
							}
							authenticatedUserSnapshot={authenticatedUserSnapshot}
							seasonsQuerySnapshot={seasonsQuerySnapshot}
						/>
					</div>

					<div className='border-t pt-6'>
						<WaiverSection
							isAuthenticatedUserSigned={isAuthenticatedUserSigned}
							isLoading={isLoading}
							isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
							isAuthenticatedUserPaid={isAuthenticatedUserPaid}
							isAuthenticatedUserBanned={isAuthenticatedUserBanned}
							currentSeasonQueryDocumentSnapshot={
								currentSeasonQueryDocumentSnapshot
							}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
