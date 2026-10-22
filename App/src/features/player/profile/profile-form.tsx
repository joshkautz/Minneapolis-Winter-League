import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/shared/components'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useEffect, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { updatePlayerViaFunction } from '@/firebase/collections/functions'
import { type DocumentSnapshot } from 'firebase/firestore'
import { errorMessage } from '@/shared/utils'
import { PlayerDocument } from '@/types'
import { useAuthContext } from '@/providers'
import {
	profileFormSchema,
	type ProfileFormData,
} from '@/shared/utils/validation'
import { UserCog } from 'lucide-react'

interface ProfileFormProps {
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
	/**
	 * The season whose signed waiver names the player, which locks their
	 * name; null while they can still change it.
	 */
	lockedBySeasonName: string | null
}

/**
 * The player's real first and last name, and their sign-in email.
 *
 * The name can be corrected until the player signs the current season's
 * waiver, which names them; then it is shown read-only and an admin
 * changes it on request. `updatePlayer` enforces the same. The nickname,
 * which can always change, has its own form.
 */
export const ProfileForm = ({
	authenticatedUserSnapshot,
	lockedBySeasonName,
}: ProfileFormProps) => {
	const locked = lockedBySeasonName !== null
	// The email shown is the sign-in address; the player document does not
	// carry it (it is private, in playerContacts).
	const { authStateUser } = useAuthContext()
	const [isSubmitting, setIsSubmitting] = useState(false)

	const form = useForm<ProfileFormData>({
		resolver: standardSchemaResolver(profileFormSchema),
		defaultValues: { firstname: '', lastname: '', email: '' },
	})

	useEffect(() => {
		if (authenticatedUserSnapshot) {
			const data = authenticatedUserSnapshot.data()
			if (data) {
				form.setValue('firstname', data.firstname)
				form.setValue('lastname', data.lastname)
				form.setValue('email', authStateUser?.email ?? '')
			}
		}
	}, [authenticatedUserSnapshot, authStateUser, form])

	const onSubmit = useCallback(async (data: ProfileFormData) => {
		setIsSubmitting(true)
		try {
			await updatePlayerViaFunction({
				firstname: data.firstname,
				lastname: data.lastname,
			})
			toast.success('Success', {
				description: 'User updated!',
			})
		} catch (err) {
			toast.error('Failure', {
				description: errorMessage(
					err,
					'Your profile could not be saved. Please try again.'
				),
			})
		} finally {
			setIsSubmitting(false)
		}
	}, [])

	return (
		<Card className='h-fit'>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<UserCog className='h-5 w-5' />
					Profile Details
				</CardTitle>
				<CardDescription>
					Manage your personal information and account details
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className='w-full space-y-6'
					>
						<FormField
							control={form.control}
							name='firstname'
							render={({ field }) => (
								<FormItem>
									<FormLabel>First Name</FormLabel>
									<FormControl>
										<Input {...field} disabled={locked} />
									</FormControl>
									<FormDescription>Your real first name.</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='lastname'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Last Name</FormLabel>
									<FormControl>
										<Input {...field} disabled={locked} />
									</FormControl>
									<FormDescription>Your real last name.</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='email'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input disabled {...field} />
									</FormControl>
									<FormDescription>
										You cannot change email addresses yet.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{locked ? (
							<p className='text-sm text-muted-foreground'>
								Your name is on your signed waiver for {lockedBySeasonName}. To
								change it, contact the league.
							</p>
						) : (
							<LoadingButton
								disabled={!form.formState.isDirty}
								type='submit'
								loading={isSubmitting}
								loadingText='Saving Changes...'
							>
								Save Changes
							</LoadingButton>
						)}
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
