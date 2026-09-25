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
import { updatePlayerViaFunction, DocumentSnapshot } from '@/firebase'
import { PlayerDocument, errorMessage } from '@/shared/utils'
import { useAuthContext } from '@/providers'
import {
	profileFormSchema,
	type ProfileFormData,
} from '@/shared/utils/validation'
import { UserCog } from 'lucide-react'

interface ProfileFormProps {
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
}

/**
 * ProfileForm Component
 *
 * Handles user profile editing (first name, last name, email)
 * Separated from main Profile component for better maintainability
 * Uses Firebase Function for secure server-side updates
 */
export const ProfileForm = ({
	authenticatedUserSnapshot,
}: ProfileFormProps) => {
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
										<Input {...field} />
									</FormControl>
									<FormDescription>
										This is your publicly displayed first name.
									</FormDescription>
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
										<Input {...field} />
									</FormControl>
									<FormDescription>
										This is your publicly displayed last name.
									</FormDescription>
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
						<LoadingButton
							disabled={!form.formState.isDirty}
							type='submit'
							loading={isSubmitting}
							loadingText='Saving Changes...'
						>
							Save Changes
						</LoadingButton>
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
