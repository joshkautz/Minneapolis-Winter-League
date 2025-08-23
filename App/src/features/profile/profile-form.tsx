import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { updatePlayer } from '@/firebase/firestore'
import { User } from 'firebase/auth'
import { DocumentSnapshot, DocumentData } from '@/firebase/firestore'
import { PlayerData } from '@/shared/utils'
import {
	profileFormSchema,
	type ProfileFormData,
} from '@/shared/utils/validation'

interface ProfileFormProps {
	authStateUser: User | null | undefined
	authenticatedUserSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined
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
		resolver: zodResolver(profileFormSchema),
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
		<div className={'max-w-(--breakpoint-md) flex-1 basis-[300px] shrink-0'}>
			<p className="mb-4 text-xl font-bold">Details</p>

			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className={'w-full space-y-6'}
				>
					<FormField
						control={form.control}
						name="firstname"
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
						name="lastname"
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
						name="email"
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
					<Button disabled={!form.formState.isDirty} type="submit">
						Save Changes
					</Button>
				</form>
			</Form>
		</div>
	)
}
