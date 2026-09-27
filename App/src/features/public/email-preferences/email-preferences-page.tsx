import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	LoadingButton,
	LoadingSpinner,
	PageContainer,
	PageHeader,
} from '@/shared/components'
import { useAuthContext } from '@/providers'
import type { OptionalEmailCategory } from '@/types'
import { categoryLabel, isOptionalEmailCategory } from './email-categories'
import { EmailPreferencesForm } from './email-preferences-form'
import { useEmailPreferences } from './use-email-preferences'

/**
 * Where the "Unsubscribe" link in every league email leads. The link
 * carries the player's id and token, so nobody needs to sign in: one button
 * unsubscribes from the kind of email they came from, and the switches below
 * change the rest. Signed in without a link, it shows the player's own.
 */
export const EmailPreferencesPage = () => {
	const [params] = useSearchParams()
	const { authStateUser, authStateLoading } = useAuthContext()
	const playerId = params.get('p')
	const token = params.get('t')
	const fromEmail = params.get('c')
	const category: OptionalEmailCategory | null = isOptionalEmailCategory(
		fromEmail
	)
		? fromEmail
		: null

	const link = useMemo(
		() => (playerId && token ? { playerId, token } : null),
		[playerId, token]
	)

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Email preferences'
				description='Choose which league emails you get'
				icon={Mail}
			/>
			{link || authStateUser ? (
				<Preferences link={link} category={category} />
			) : authStateLoading ? (
				<LoadingSpinner size='lg' centered />
			) : (
				<Card className='mx-auto w-full max-w-xl'>
					<CardContent className='pt-6 space-y-2'>
						<p>
							Open this page from the <strong>Unsubscribe</strong> link at the
							bottom of any league email, or sign in and manage your email on
							your{' '}
							<Link to='/profile' className='underline'>
								profile
							</Link>
							.
						</p>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	)
}

const Preferences = ({
	link,
	category,
}: {
	link: { playerId: string; token: string } | null
	category: OptionalEmailCategory | null
}) => {
	const { state, saving, update } = useEmailPreferences(link)
	const [unsubscribed, setUnsubscribed] = useState(false)

	if (state.status === 'loading') return <LoadingSpinner size='lg' centered />
	if (state.status === 'error') {
		return (
			<Alert variant='destructive' className='mx-auto w-full max-w-xl'>
				<AlertDescription>{state.message}</AlertDescription>
			</Alert>
		)
	}

	const { email, preferences } = state
	const label = category ? categoryLabel(category).toLowerCase() : ''

	const setCategory = async (on: boolean) => {
		if (!category) return
		const result = await update({ [category]: on })
		if (result === true) setUnsubscribed(!on)
		else toast.error('Not saved', { description: result })
	}

	return (
		<div className='mx-auto w-full max-w-xl space-y-6'>
			{category &&
				(preferences[category] ? (
					<Card>
						<CardHeader>
							<CardTitle>Unsubscribe from {label}?</CardTitle>
							<CardDescription>
								You won&apos;t get {label} at {email} anymore.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<LoadingButton
								size='lg'
								className='w-full sm:w-auto'
								loading={saving}
								loadingText='Unsubscribing...'
								onClick={() => setCategory(false)}
							>
								Unsubscribe
							</LoadingButton>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2'>
								<CheckCircle2
									className='h-5 w-5 text-green-600'
									aria-hidden='true'
								/>
								You&apos;re unsubscribed from {label}
							</CardTitle>
							<CardDescription>
								{unsubscribed
									? `Done. It takes effect straight away.`
									: `You already don't get ${label} at ${email}.`}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<LoadingButton
								variant='outline'
								loading={saving}
								loadingText='Saving...'
								onClick={() => setCategory(true)}
							>
								{unsubscribed ? 'Undo' : 'Resubscribe'}
							</LoadingButton>
						</CardContent>
					</Card>
				))}
			<Card>
				<CardHeader>
					<CardTitle>Choose which emails you get</CardTitle>
					<CardDescription>For {email}</CardDescription>
				</CardHeader>
				<CardContent>
					<EmailPreferencesForm
						preferences={preferences}
						saving={saving}
						update={update}
					/>
				</CardContent>
			</Card>
		</div>
	)
}
