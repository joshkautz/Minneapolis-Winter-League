import { useAuthContext } from '@/providers'
import { useMemo } from 'react'
import { GradientHeader } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { Timestamp } from '@firebase/firestore'
import { ReloadIcon } from '@radix-ui/react-icons'
import { ProfileForm } from './profile-form'
import { ProfileActions } from './profile-actions'
import type { PlayerSeason } from '@/types'

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
		<div
			className={
				'container flex flex-col items-center md:min-h-[calc(100vh-60px)] gap-10'
			}
		>
			<GradientHeader>
				<p>Profile</p>
			</GradientHeader>

			<div
				className={
					'flex md:flex-row flex-col flex-wrap items-stretch justify-center w-full md:space-x-16 md:space-y-0 space-y-16 space-x-0'
				}
			>
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
