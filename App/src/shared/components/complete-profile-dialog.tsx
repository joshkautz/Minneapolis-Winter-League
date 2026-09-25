import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { createPlayerViaFunction } from '@/firebase/collections/functions'
import { useAuthContext } from '@/providers'
import { errorMessage, logger } from '@/shared/utils'
import {
	completeProfileFormSchema,
	type CompleteProfileFormData,
} from '@/shared/utils/validation'
import { LoadingButton } from './loading-button'

/**
 * Finishes a sign-up whose player profile was never created.
 *
 * Signing up creates the Auth account first and the player document second,
 * with `createPlayer`. If that second step fails — the connection drops, the
 * server errors — the account exists with no profile, and every page that
 * needs one waits for it forever. This asks for the name again and retries,
 * on whatever page the player is on, until it succeeds.
 */
export const CompleteProfileDialog = () => {
	const {
		authStateUser,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
	} = useAuthContext()
	const [problem, setProblem] = useState<string | null>(null)

	const form = useForm<CompleteProfileFormData>({
		resolver: standardSchemaResolver(completeProfileFormSchema),
		defaultValues: { firstname: '', lastname: '' },
	})

	const profileMissing =
		Boolean(authStateUser) &&
		!authenticatedUserSnapshotLoading &&
		authenticatedUserSnapshot !== undefined &&
		!authenticatedUserSnapshot.exists()

	const onSubmit = async (data: CompleteProfileFormData) => {
		if (!authStateUser?.email) return
		setProblem(null)
		try {
			await createPlayerViaFunction({
				firstname: data.firstname,
				lastname: data.lastname,
				email: authStateUser.email,
			})
			// The profile listener closes the dialog once the document exists.
		} catch (error) {
			logger.error('Completing a missing profile failed', error, {
				component: 'CompleteProfileDialog',
				userId: authStateUser.uid,
			})
			setProblem(
				errorMessage(
					error,
					'Your profile could not be saved. Please try again.'
				)
			)
		}
	}

	return (
		<Dialog open={profileMissing}>
			<DialogContent
				className='sm:max-w-md'
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Finish setting up your profile</DialogTitle>
					<DialogDescription>
						Your account was created, but your player profile was not saved.
						Enter your name to finish.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className='space-y-4'
						noValidate
					>
						<FormField
							control={form.control}
							name='firstname'
							render={({ field }) => (
								<FormItem>
									<FormLabel>First name</FormLabel>
									<FormControl>
										<Input autoComplete='given-name' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name='lastname'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Last name</FormLabel>
									<FormControl>
										<Input autoComplete='family-name' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{problem && (
							<p role='alert' className='text-sm text-destructive'>
								{problem}
							</p>
						)}
						<LoadingButton
							type='submit'
							className='w-full'
							loading={form.formState.isSubmitting}
							loadingText='Saving...'
						>
							Save profile
						</LoadingButton>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
