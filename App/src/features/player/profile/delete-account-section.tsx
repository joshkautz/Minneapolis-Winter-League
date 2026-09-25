import { FormEvent, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Trash2 } from 'lucide-react'
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/shared/components'
import { usePendingAction } from '@/shared/hooks'
import { useDeleteAccount } from './use-delete-account'

interface DeleteAccountSectionProps {
	/** On a team this season, which blocks deletion until they leave it. */
	isRostered: boolean
	isBanned: boolean
	/** The current season's name, for the "leave your team" message. */
	currentSeasonName: string | undefined
}

/**
 * Lets a player delete their own account.
 *
 * Deletion is permanent, so the dialog says exactly what goes and what the
 * league keeps, and asks for the password again. The server enforces every
 * rule shown here; the page only explains them before the player tries.
 */
export const DeleteAccountSection = ({
	isRostered,
	isBanned,
	currentSeasonName,
}: DeleteAccountSectionProps) => {
	return (
		<Card className='border-red-200 dark:border-red-900'>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Trash2 className='h-5 w-5' aria-hidden='true' />
					Delete account
				</CardTitle>
				<CardDescription>
					Permanently delete your account and sign-in.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-3'>
				{isBanned ? (
					<p className='text-sm text-muted-foreground'>
						Your account is banned, so it can only be deleted by the league.
						Email{' '}
						<a
							className='underline underline-offset-4'
							href='mailto:leadership@mplsmallard.com'
						>
							leadership@mplsmallard.com
						</a>
						.
					</p>
				) : isRostered ? (
					<>
						<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
							<AlertCircle className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
							<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
								You are on a team for {currentSeasonName ?? 'this season'}.
								Leave your team before you delete your account, so your
								teammates are not left a player short without warning.
							</AlertDescription>
						</Alert>
						<Button asChild variant='outline' size='sm'>
							<Link to='/manage'>Go to your team</Link>
						</Button>
					</>
				) : (
					<DeleteAccountDialog />
				)}
			</CardContent>
		</Card>
	)
}

const DeleteAccountDialog = () => {
	const [open, setOpen] = useState(false)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const { pending, run } = usePendingAction()
	const { deleteAccount } = useDeleteAccount()
	const passwordId = useId()
	const errorId = useId()

	const handleOpenChange = (next: boolean) => {
		// Neither Escape, the overlay nor Cancel may close it mid-request.
		if (pending) return
		setOpen(next)
		if (!next) {
			setPassword('')
			setError(null)
		}
	}

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!password) return
		setError(null)
		void run(async () => {
			const failure = await deleteAccount(password)
			if (failure === null) return true
			setError(failure)
			return false
		})
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button variant='destructive' size='sm'>
					<Trash2 className='h-4 w-4' aria-hidden='true' />
					Delete account
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent aria-busy={pending}>
				<form onSubmit={handleSubmit} className='space-y-4'>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete your account?</AlertDialogTitle>
						<AlertDialogDescription>
							This cannot be undone. You will be signed out, and you would need
							to sign up again to play.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className='space-y-3 text-sm'>
						<div>
							<p className='font-medium'>Deleted</p>
							<ul className='mt-1 list-disc space-y-1 pl-5 text-muted-foreground'>
								<li>Your profile, name and email address</li>
								<li>Your team history and leaderboard ranking</li>
								<li>Any team invitations or requests you have open</li>
								<li>Your sign-in</li>
							</ul>
						</div>
						<div>
							<p className='font-medium'>Kept</p>
							<ul className='mt-1 list-disc space-y-1 pl-5 text-muted-foreground'>
								<li>
									Your signed waivers, as the league&rsquo;s legal record of the
									release. Only league admins can see them.
								</li>
								<li>Your posts and replies, shown as from a former player.</li>
								<li>
									Payments toward a team, as part of that team&rsquo;s record.
								</li>
							</ul>
						</div>
					</div>

					<div className='space-y-2'>
						<Label htmlFor={passwordId}>Enter your password to confirm</Label>
						<Input
							id={passwordId}
							type='password'
							autoComplete='current-password'
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={pending}
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? errorId : undefined}
						/>
						{error && (
							<p id={errorId} role='alert' className='text-sm text-destructive'>
								{error}
							</p>
						)}
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
						<LoadingButton
							type='submit'
							variant='destructive'
							disabled={!password}
							loading={pending}
							loadingText='Deleting...'
						>
							Delete my account
						</LoadingButton>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	)
}
