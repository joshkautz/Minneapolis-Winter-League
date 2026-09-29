import { Mail } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { LoadingSpinner } from '@/shared/components'
import { LEAGUE_CONTACT } from '@/shared/utils'
import {
	EmailPreferencesForm,
	useEmailPreferences,
} from '@/features/public/email-preferences'

/** The signed-in player's email preferences, on their profile. */
export const EmailPreferencesSection = () => {
	const { state, saving, update } = useEmailPreferences(null)

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Mail className='h-5 w-5' aria-hidden='true' />
					Email
				</CardTitle>
				<CardDescription>
					{state.status === 'ready'
						? `Choose which league emails ${state.email} gets.`
						: 'Choose which league emails you get.'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{state.status === 'loading' && <LoadingSpinner centered />}
				{state.status === 'error' && (
					<Alert variant='destructive'>
						<AlertDescription>{state.message}</AlertDescription>
					</Alert>
				)}
				{state.status === 'ready' && state.undeliverable && (
					<Alert variant='destructive' className='mb-4'>
						<AlertDescription>
							Email to {state.email} is bouncing, so the league cannot reach
							you. Email {LEAGUE_CONTACT} to change your address.
						</AlertDescription>
					</Alert>
				)}
				{state.status === 'ready' && (
					<EmailPreferencesForm
						preferences={state.preferences}
						saving={saving}
						update={update}
					/>
				)}
			</CardContent>
		</Card>
	)
}
