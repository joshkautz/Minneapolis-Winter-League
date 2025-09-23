import { useAuthContext } from '@/providers'
import { useMemo } from 'react'
import { useSeasonsContext } from '@/providers'
import { Timestamp } from '@firebase/firestore'
import { ReloadIcon } from '@radix-ui/react-icons'
import { ProfileForm } from './profile-form'
import { ProfileActions } from './profile-actions'
import type { PlayerSeason } from '@/types'
import { User } from 'lucide-react'

export const Profile = () => {
	const {
		authStateUser,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isAuthenticatedUserAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin ?? false,
		[authenticatedUserSnapshot]
	)

	const isAuthenticatedUserPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid ?? false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserSigned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed ?? false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isVerified = useMemo(
		() => authStateUser?.emailVerified,
		[authStateUser]
	)

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
		() => !authenticatedUserSnapshot || authenticatedUserSnapshotLoading,
		[authenticatedUserSnapshot, authenticatedUserSnapshotLoading]
	)

	const isAuthenticatedUserBanned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.banned ?? false,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	if (isLoading) {
		return (
			<div className={'absolute inset-0 flex items-center justify-center'}>
				<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
			</div>
		)
	}

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<User className='h-8 w-8' />
					Profile
				</h1>
				<p className='text-muted-foreground'>
					Manage your player profile and account settings
				</p>
			</div>

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
		</div>
	)
}
