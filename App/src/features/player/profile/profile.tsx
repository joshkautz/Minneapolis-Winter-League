import { useMemo } from 'react'
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
	const { currentSeasonQueryDocumentSnapshot, seasonsQuerySnapshot } =
		useSeasonsContext()

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
				<ProfileForm authenticatedUserSnapshot={authenticatedUserSnapshot} />

				<ProfileActions
					authStateUser={authStateUser}
					isVerified={isVerified}
					isLoading={isLoading}
					isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
					isAuthenticatedUserBanned={isAuthenticatedUserBanned}
					isAuthenticatedUserPaid={isAuthenticatedUserPaid}
					isAuthenticatedUserSigned={isAuthenticatedUserSigned}
					currentSeasonQueryDocumentSnapshot={
						currentSeasonQueryDocumentSnapshot
					}
					authenticatedUserSnapshot={authenticatedUserSnapshot}
					seasonsQuerySnapshot={seasonsQuerySnapshot}
				/>
			</div>
		</PageContainer>
	)
}
