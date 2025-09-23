import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { updatePlayer } from '@/firebase/firestore'
import { User } from 'firebase/auth'
import { DocumentSnapshot } from '@/firebase/firestore'
import { PlayerDocument } from '@/shared/utils'
import {
	profileFormSchema,
	type ProfileFormData,
} from '@/shared/utils/validation'
import { UserCog } from 'lucide-react'

interface ProfileFormProps {
	authStateUser: User | null | undefined
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
}

/**
 * ProfileForm Component
 *
 * Handles user profile editing (first name, last name, email)
 * Separated from main Profile component for better maintainability
 */
export const ProfileForm = ({
	authStateUser,
	authenticatedUserSnapshot,
}: ProfileFormProps) => {
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
				form.setValue('email', data.email)
			}
		}
	}, [authenticatedUserSnapshot, form])

	const onSubmit = useCallback(
		(data: ProfileFormData) => {
			updatePlayer(authStateUser, {
				firstname: data.firstname,
				lastname: data.lastname,
			})
				.then(() => {
					toast.success('Success', {
						description: 'User updated!',
					})
				})
				.catch((err) => {
					toast.error('Failure', {
						description: `${err}`,
					})
				})
		},
		[authStateUser]
	)

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
						<Button disabled={!form.formState.isDirty} type='submit'>
							Save Changes
						</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
