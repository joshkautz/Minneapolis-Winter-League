/**
 * `/auth/action` — where the league's account emails land.
 *
 * The league sends the emails that confirm an address and reset a password
 * (`sendVerificationEmail`, `requestPasswordReset`, and `createPlayer` at
 * sign-up), and their links come here rather than to Firebase's own page.
 * Firebase still checks and spends the one-time code: this page only asks
 * it to, with the App's own Firebase client.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import * as z from 'zod'
import {
	applyActionCode,
	confirmPasswordReset,
	signInWithEmailAndPassword,
	verifyPasswordResetCode,
} from 'firebase/auth'
import { CheckCircle, KeyRound, MailCheck, XCircle } from 'lucide-react'
import { auth } from '@/firebase/app'
import { useAuthContext } from '@/providers'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LoadingButton, LoadingSpinner } from '@/shared/components'
import { errorCode, logger } from '@/shared/utils'
import { passwordSchema } from '@/shared/utils/validation'

/** What a used, expired or mangled code looks like to Firebase. */
const DEAD_CODES = new Set([
	'auth/expired-action-code',
	'auth/invalid-action-code',
	'auth/user-disabled',
	'auth/user-not-found',
])

/** Why a link did not work, in words for the player. */
const linkProblem = (error: unknown, sendAnother: string): string =>
	DEAD_CODES.has(errorCode(error) ?? '')
		? `This link has expired or has already been used. ${sendAnother}`
		: 'Something went wrong. Please try the link again in a moment.'

const Page = ({
	icon,
	title,
	description,
	children,
}: {
	icon: React.ReactNode
	title: string
	description?: string
	children?: React.ReactNode
}) => (
	<div className='container max-w-md py-12'>
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					{icon}
					{title}
				</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			{children && <CardContent className='space-y-4'>{children}</CardContent>}
		</Card>
	</div>
)

const Problem = ({ message }: { message: string }) => (
	<Page
		icon={<XCircle className='h-5 w-5 text-destructive' aria-hidden='true' />}
		title='This link didn’t work'
	>
		<Alert variant='destructive'>
			<AlertDescription>{message}</AlertDescription>
		</Alert>
		<Button asChild variant='outline' className='w-full'>
			<Link to='/'>Go to the home page</Link>
		</Button>
	</Page>
)

type Outcome =
	| { state: 'working' }
	| { state: 'done' }
	| { state: 'failed'; message: string }

/** Confirms the address, once, and brings a signed-in session up to date. */
const VerifyEmail = ({ code }: { code: string }) => {
	const { authStateUser, refreshUser } = useAuthContext()
	const [outcome, setOutcome] = useState<Outcome>({ state: 'working' })
	// A code works once; React's development double effect must not spend
	// it twice and report the second, failed attempt.
	const started = useRef(false)

	useEffect(() => {
		if (started.current) return
		started.current = true
		applyActionCode(auth, code)
			.then(() => setOutcome({ state: 'done' }))
			.catch((error: unknown) => {
				logger.error('Email confirmation failed', error, {
					component: 'AuthAction',
				})
				setOutcome({
					state: 'failed',
					message: linkProblem(
						error,
						'If your email still isn’t confirmed, send a new link from your profile.'
					),
				})
			})
	}, [code])

	// The signed-in session learns of it now rather than at its next refresh.
	useEffect(() => {
		if (outcome.state === 'done' && authStateUser) {
			refreshUser().catch(() => undefined)
		}
	}, [outcome.state, authStateUser, refreshUser])

	if (outcome.state === 'working') return <LoadingSpinner size='lg' centered />
	if (outcome.state === 'failed') return <Problem message={outcome.message} />
	return (
		<Page
			icon={<MailCheck className='h-5 w-5 text-green-600' aria-hidden='true' />}
			title='Your email is confirmed'
			description='You can now join a team, sign the waiver and pay.'
		>
			<Button asChild className='w-full'>
				<Link to={authStateUser ? '/profile' : '/'}>
					{authStateUser ? 'Go to your profile' : 'Go to the home page'}
				</Link>
			</Button>
		</Page>
	)
}

const newPasswordSchema = z
	.object({ password: passwordSchema, confirm: z.string() })
	.refine((data) => data.password === data.confirm, {
		error: 'The passwords don’t match',
		path: ['confirm'],
	})
type NewPassword = z.infer<typeof newPasswordSchema>

/** Checks the code, then takes a new password and signs the player in. */
const ResetPassword = ({ code }: { code: string }) => {
	const [email, setEmail] = useState<string | null>(null)
	const [outcome, setOutcome] = useState<Outcome>({ state: 'working' })
	const form = useForm<NewPassword>({
		resolver: standardSchemaResolver(newPasswordSchema),
		defaultValues: { password: '', confirm: '' },
	})

	useEffect(() => {
		let current = true
		verifyPasswordResetCode(auth, code)
			.then((address) => {
				if (current) setEmail(address)
			})
			.catch((error: unknown) => {
				if (!current) return
				setOutcome({
					state: 'failed',
					message: linkProblem(
						error,
						'Ask for a new one from “Forgot password?” when you sign in.'
					),
				})
			})
		return () => {
			current = false
		}
	}, [code])

	const onSubmit = async ({ password }: NewPassword) => {
		try {
			await confirmPasswordReset(auth, code, password)
		} catch (error) {
			logger.error('Password reset failed', error, { component: 'AuthAction' })
			setOutcome({
				state: 'failed',
				message: linkProblem(
					error,
					'Ask for a new one from “Forgot password?” when you sign in.'
				),
			})
			return
		}
		// Signing in is a convenience: the password has changed either way.
		if (email) {
			await signInWithEmailAndPassword(auth, email, password).catch(
				(error: unknown) =>
					logger.error('Sign-in after reset failed', error, {
						component: 'AuthAction',
					})
			)
		}
		setOutcome({ state: 'done' })
	}

	if (outcome.state === 'failed') return <Problem message={outcome.message} />
	if (outcome.state === 'done') {
		return (
			<Page
				icon={
					<CheckCircle className='h-5 w-5 text-green-600' aria-hidden='true' />
				}
				title='Your password is changed'
				description='You’re signed in with your new password.'
			>
				<Button asChild className='w-full'>
					<Link to='/profile'>Go to your profile</Link>
				</Button>
			</Page>
		)
	}
	if (!email) return <LoadingSpinner size='lg' centered />
	return (
		<Page
			icon={<KeyRound className='h-5 w-5' aria-hidden='true' />}
			title='Choose a new password'
			description={`For ${email}`}
		>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
					<FormField
						control={form.control}
						name='password'
						render={({ field }) => (
							<FormItem>
								<FormLabel>New password</FormLabel>
								<FormControl>
									<Input
										type='password'
										autoComplete='new-password'
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name='confirm'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Confirm new password</FormLabel>
								<FormControl>
									<Input
										type='password'
										autoComplete='new-password'
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<LoadingButton
						type='submit'
						className='w-full'
						loading={form.formState.isSubmitting}
						loadingText='Saving...'
					>
						Save new password
					</LoadingButton>
				</form>
			</Form>
		</Page>
	)
}

export const AuthAction = () => {
	const [params] = useSearchParams()
	const mode = params.get('mode')
	const code = params.get('oobCode')

	if (!code) {
		return (
			<Problem message='This link is missing its code. Open it again from the email.' />
		)
	}
	if (mode === 'verifyEmail') return <VerifyEmail code={code} />
	if (mode === 'resetPassword') return <ResetPassword code={code} />
	return <Problem message='This isn’t a link the league sends.' />
}
