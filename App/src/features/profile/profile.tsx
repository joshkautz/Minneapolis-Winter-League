import { useMemo } from 'react'
import { Timestamp } from '@firebase/firestore'
import { ProfileForm } from './profile-form'
import { ProfileActions } from './profile-actions'
import { User } from 'lucide-react'
import { useUserStatus } from '@/shared/hooks'
import { useSeasonsContext } from '@/providers'
import { LoadingSpinner, PageContainer, PageHeader } from '@/shared/components'

export const Profile = () => {
	const {
		isLoading: userStatusLoading,
		isAdmin: isAuthenticatedUserAdmin,
		hasPaid: isAuthenticatedUserPaid,
		hasSignedWaiver: isAuthenticatedUserSigned,
		authStateUser,
		userSnapshot: authenticatedUserSnapshot,
		isUserSnapshotLoading: authenticatedUserSnapshotLoading,
		isEmailVerified: isVerified,
		isBanned: isAuthenticatedUserBanned,
	} = useUserStatus()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isRegistrationOpen = useMemo(
		() =>
			currentSeasonQueryDocumentSnapshot &&
			Timestamp.now() >
				currentSeasonQueryDocumentSnapshot?.data().registrationStart &&
			Timestamp.now() <
				currentSeasonQueryDocumentSnapshot?.data().registrationEnd,
		[currentSeasonQueryDocumentSnapshot]
	)

	const isLoading = useMemo(
		() =>
			userStatusLoading ||
			!authenticatedUserSnapshot ||
			authenticatedUserSnapshotLoading,
		[
			userStatusLoading,
			authenticatedUserSnapshot,
			authenticatedUserSnapshotLoading,
		]
	)

	if (isLoading) {
		return <LoadingSpinner size='lg' centered />
	}

	return (
		<PageContainer>
			<PageHeader
				title='Profile'
				description='Manage your player profile and account settings'
				icon={User}
			/>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto'>
				<ProfileForm
					authStateUser={authStateUser}
					authenticatedUserSnapshot={authenticatedUserSnapshot}
				/>

				<ProfileActions
					authStateUser={authStateUser}
					isVerified={isVerified}
					isLoading={isLoading}
					isRegistrationOpen={isRegistrationOpen}
					isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
					isAuthenticatedUserBanned={isAuthenticatedUserBanned}
					isAuthenticatedUserPaid={isAuthenticatedUserPaid}
					isAuthenticatedUserSigned={isAuthenticatedUserSigned}
					currentSeasonQueryDocumentSnapshot={
						currentSeasonQueryDocumentSnapshot
					}
				/>
			</div>
		</PageContainer>
	)
}
