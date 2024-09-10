import { useAuthContext } from '@/contexts/auth-context'
import { Input } from '@/components/ui/input'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from './ui/use-toast'
import { stripeRegistration, updatePlayer } from '@/firebase/firestore'
import { Label } from './ui/label'
import {
	CheckCircledIcon,
	InfoCircledIcon,
	ReloadIcon,
} from '@radix-ui/react-icons'
import { GradientHeader } from './gradient-header'
import { useSeasonsContext } from '@/contexts/seasons-context'
import { Timestamp } from '@firebase/firestore'
import { sendDropboxEmail } from '../firebase/functions'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './ui/tooltip'
import { DropboxError, DropboxResult } from '@/lib/interfaces'
import { formatTimestamp } from '@/lib/utils'

const profileSchema = z.object({
	firstname: z.string(),
	lastname: z.string(),
	email: z.string().email(),
})

type ProfileSchema = z.infer<typeof profileSchema>

export const Profile = () => {
	const {
		authStateUser,
		authenticatedUserSnapshot,
		authenticatedUserSnapshotLoading,
		sendEmailVerification,
	} = useAuthContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [verificationEmailSent, setVerificationEmailSent] = useState(false)
	const [verificationEmailLoading, setVerificationEmailLoading] =
		useState(false)
	const [stripeLoading, setStripeLoading] = useState<boolean>(false)
	const [stripeError, setStripeError] = useState<string>()
	const [dropboxEmailSent, setDropboxEmailSent] = useState(false)
	const [dropboxEmailLoading, setDropboxEmailLoading] = useState(false)

	const form = useForm<ProfileSchema>({
		resolver: zodResolver(profileSchema),
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
	}, [authenticatedUserSnapshot])

	useEffect(() => {
		if (stripeError) {
			toast({
				title: `Failure`,
				description: stripeError,
				variant: 'destructive',
			})
			setStripeError(undefined)
		}
	}, [stripeError])

	const onSubmit = useCallback(
		(data: ProfileSchema) => {
			updatePlayer(authStateUser, {
				firstname: data.firstname,
				lastname: data.lastname,
			})
				.then(() => {
					toast({
						title: `Success`,
						description: `User updated!`,
						variant: 'default',
					})
				})
				.catch((err) => {
					toast({
						title: `Failure`,
						description: `${err}`,
						variant: 'destructive',
					})
				})
		},
		[updatePlayer, authStateUser]
	)

	const sendVerificationEmailButtonOnClickHandler = useCallback(() => {
		setVerificationEmailLoading(true)
		sendEmailVerification().then(() => {
			setVerificationEmailSent(true)
			setVerificationEmailLoading(false)
		})
	}, [
		sendEmailVerification,
		setVerificationEmailSent,
		setVerificationEmailLoading,
	])

	const registrationButtonOnClickHandler = useCallback(() => {
		stripeRegistration(authStateUser, setStripeLoading, setStripeError)
	}, [stripeRegistration, authStateUser, setStripeLoading, setStripeError])

	const sendDropboxEmailButtonOnClickHandler = useCallback(() => {
		setDropboxEmailLoading(true)
		sendDropboxEmail().then((result) => {
			if ('result' in result.data) {
				const data: DropboxResult = result.data as DropboxResult
				setDropboxEmailSent(true)
				setDropboxEmailLoading(false)
				toast({
					title: `Success`,
					description: `Email sent to ${data.result.requesterEmailAddress}`,
					variant: 'default',
				})
			}

			if ('error' in result.data) {
				const data: DropboxError = result.data as DropboxError
				setDropboxEmailSent(false)
				setDropboxEmailLoading(false)
				toast({
					title: `Failure`,
					description: `Dropbox Error: ${data.error.message}`,
					variant: 'destructive',
				})
			}
		})
	}, [sendDropboxEmail, setDropboxEmailSent, setDropboxEmailLoading, toast])

	const isAuthenticatedUserAdmin = useMemo(
		() => authenticatedUserSnapshot?.data()?.admin,
		[authenticatedUserSnapshot]
	)

	const isAuthenticatedUserPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserSigned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed,
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

	return (
		<div
			className={
				'container flex flex-col items-center md:min-h-[calc(100vh-60px)] gap-10'
			}
		>
			<GradientHeader>
				<p>Profile Settings</p>
				<p className={'text-sm font-normal text-foreground'}>
					Configure your profile with the options below.
				</p>
			</GradientHeader>

			{form ? (
				<div
					className={
						'flex flex-row flex-wrap items-stretch justify-center w-full gap-8'
					}
				>
					<div className={'max-w-[400px] flex-1 basis-[300px] shrink-0'}>
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

					<div className={'max-w-[400px] flex-1 basis-[300px] shrink-0'}>
						<div className={'flex flex-col gap-6'}>
							<fieldset className={'space-y-2'}>
								<Label className={'inline-flex'}>
									Email Verification
									{isLoading ? (
										<></>
									) : (
										!isVerified && (
											<span className={'relative flex w-2 h-2 ml-1'}>
												{/* <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-primary"></span> */}
												<span
													className={
														'relative inline-flex w-2 h-2 rounded-full bg-primary'
													}
												></span>
											</span>
										)
									)}
								</Label>
								<div>
									{isLoading || isVerified === undefined ? (
										<div className={'inline-flex items-center gap-2'}>
											Loading...
										</div>
									) : isVerified ? (
										<div
											className={
												'inline-flex items-center gap-2 text-green-600 dark:text-green-500'
											}
										>
											Complete <CheckCircledIcon className={'w-4 h-4'} />
										</div>
									) : (
										<>
											<Button
												variant={'default'}
												onClick={sendVerificationEmailButtonOnClickHandler}
												disabled={
													verificationEmailSent || verificationEmailLoading
												}
											>
												{verificationEmailLoading && (
													<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
												)}
												{verificationEmailSent
													? 'Email Sent!'
													: 'Re-Send Verification Email'}
											</Button>
											<p className={'text-[0.8rem] text-muted-foreground mt-2'}>
												Check your email for a verification link.
											</p>
										</>
									)}
								</div>
							</fieldset>
							<fieldset className={'space-y-2'}>
								<Label className={'inline-flex'}>
									Payment
									{isLoading || isAuthenticatedUserPaid === undefined ? (
										<></>
									) : (
										!isAuthenticatedUserPaid && (
											<span className={'relative flex w-2 h-2 ml-1'}>
												<span
													className={
														'relative inline-flex w-2 h-2 rounded-full bg-primary'
													}
												></span>
											</span>
										)
									)}
								</Label>
								<div>
									{isLoading || isAuthenticatedUserPaid === undefined ? (
										<div className={'inline-flex items-center gap-2'}>
											Loading...
										</div>
									) : isAuthenticatedUserPaid ? (
										<div
											className={
												'inline-flex items-center gap-2 text-green-600 dark:text-green-500'
											}
										>
											Complete <CheckCircledIcon className={'w-4 h-4'} />
										</div>
									) : (
										<>
											<Button
												variant={'default'}
												onClick={registrationButtonOnClickHandler}
												disabled={
													(!isRegistrationOpen && !isAuthenticatedUserAdmin) ||
													stripeLoading
												}
											>
												{stripeLoading && (
													<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
												)}
												Pay via Stripe
											</Button>

											{!isRegistrationOpen && !isAuthenticatedUserAdmin ? (
												<p
													className={'text-[0.8rem] text-muted-foreground mt-2'}
												>
													Registration opens on{' '}
													{formatTimestamp(
														currentSeasonQueryDocumentSnapshot?.data()
															.registrationStart
													)}
												</p>
											) : (
												<p
													className={'text-[0.8rem] text-muted-foreground mt-2'}
												>
													Complete registration by paying via Stripe.
												</p>
											)}
										</>
									)}
								</div>
							</fieldset>
							<fieldset className={'space-y-2'}>
								<Label className={'inline-flex'}>
									Waiver
									{isLoading || isAuthenticatedUserSigned === undefined ? (
										<></>
									) : (
										!isAuthenticatedUserSigned && (
											<span className={'relative flex w-2 h-2 ml-1'}>
												<span
													className={
														'relative inline-flex w-2 h-2 rounded-full bg-primary'
													}
												></span>
											</span>
										)
									)}
								</Label>
								<div>
									{isLoading || isAuthenticatedUserSigned === undefined ? (
										<div className={'inline-flex items-center gap-2'}>
											Loading...
										</div>
									) : isAuthenticatedUserSigned ? (
										<div
											className={
												'inline-flex items-center gap-2 text-green-600 dark:text-green-500'
											}
										>
											Complete <CheckCircledIcon className={'w-4 h-4'} />
										</div>
									) : (
										<>
											<span className="inline-flex items-center">
												<Button
													variant={'default'}
													onClick={sendDropboxEmailButtonOnClickHandler}
													disabled={
														(!isRegistrationOpen &&
															!isAuthenticatedUserAdmin) ||
														dropboxEmailLoading ||
														dropboxEmailSent ||
														!isAuthenticatedUserPaid
													}
												>
													{dropboxEmailLoading && (
														<ReloadIcon
															className={'mr-2 h-4 w-4 animate-spin'}
														/>
													)}
													{dropboxEmailSent
														? 'Email Sent!'
														: 'Re-Send Waiver Email'}
												</Button>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger asChild>
															<div className={'flex-1'}>
																<InfoCircledIcon className={'w-6 h-6'} />
															</div>
														</TooltipTrigger>
														<TooltipContent>
															<p>Waiver will be sent following payment.</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</span>

											{!isRegistrationOpen && !isAuthenticatedUserAdmin ? (
												<p
													className={'text-[0.8rem] text-muted-foreground mt-2'}
												>
													Registration opens on{' '}
													{formatTimestamp(
														currentSeasonQueryDocumentSnapshot?.data()
															.registrationStart
													)}
												</p>
											) : (
												<p
													className={'text-[0.8rem] text-muted-foreground mt-2'}
												>
													Check your email for a Dropbox Sign link.
												</p>
											)}
										</>
									)}
								</div>
							</fieldset>
						</div>
					</div>
				</div>
			) : (
				<div className={'absolute inset-0 flex items-center justify-center'}>
					<ReloadIcon className={'mr-2 h-10 w-10 animate-spin'} />
				</div>
			)}
		</div>
	)
}
