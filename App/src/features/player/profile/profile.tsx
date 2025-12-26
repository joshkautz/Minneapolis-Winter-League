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
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Profile'
				description='Manage your player profile and account settings'
				icon={User}
			/>

			<div className='flex flex-col lg:flex-row items-stretch gap-6 w-full'>
				<div className='w-full lg:flex-1'>
					<ProfileForm authenticatedUserSnapshot={authenticatedUserSnapshot} />
				</div>

				<div className='w-full lg:flex-1'>
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
			</div>
		</PageContainer>
	)
}
