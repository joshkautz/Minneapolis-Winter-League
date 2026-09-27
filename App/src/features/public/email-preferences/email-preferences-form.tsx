import { useId } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LoadingButton } from '@/shared/components'
import type { EmailPreferences } from '@/firebase/collections/functions'
import { EMAIL_CATEGORIES } from './email-categories'

interface EmailPreferencesFormProps {
	preferences: EmailPreferences
	saving: boolean
	update: (changes: Partial<EmailPreferences>) => Promise<true | string>
}

const ALL_OFF: EmailPreferences = {
	announcements: false,
	registration: false,
	teams: false,
}

/**
 * One switch per kind of email, saved as it is flipped, and a way to turn
 * them all off at once — CAN-SPAM requires that a menu of choices include
 * stopping everything.
 */
export const EmailPreferencesForm = ({
	preferences,
	saving,
	update,
}: EmailPreferencesFormProps) => {
	const id = useId()
	const anyOn = Object.values(preferences).some(Boolean)

	const save = async (changes: Partial<EmailPreferences>, done: string) => {
		const result = await update(changes)
		if (result === true) toast.success(done)
		else toast.error('Not saved', { description: result })
	}

	return (
		<div className='space-y-5'>
			<ul className='space-y-4' aria-label='Kinds of email'>
				{EMAIL_CATEGORIES.map(({ category, label, description }) => (
					<li key={category} className='flex items-start justify-between gap-4'>
						<div className='space-y-1'>
							<Label htmlFor={`${id}-${category}`} className='text-base'>
								{label}
							</Label>
							<p
								id={`${id}-${category}-description`}
								className='text-sm text-muted-foreground'
							>
								{description}
							</p>
						</div>
						<Switch
							id={`${id}-${category}`}
							aria-describedby={`${id}-${category}-description`}
							checked={preferences[category]}
							disabled={saving}
							onCheckedChange={(checked) =>
								save(
									{ [category]: checked },
									checked
										? `You'll get ${label.toLowerCase()}.`
										: `You won't get ${label.toLowerCase()} anymore.`
								)
							}
						/>
					</li>
				))}
			</ul>
			<div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
				<p className='text-sm text-muted-foreground'>
					Account emails, like password resets, are always sent.
				</p>
				<LoadingButton
					variant='outline'
					loading={saving}
					loadingText='Saving...'
					disabled={!anyOn}
					onClick={() =>
						save(ALL_OFF, "You're unsubscribed from all league emails.")
					}
				>
					Unsubscribe from all
				</LoadingButton>
			</div>
		</div>
	)
}
