import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSignature } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSeasonsContext } from '@/providers'
import { useUserStatus } from '@/shared/hooks'
import { MIN_SIGNED_PLAYERS } from '@/shared/utils'

/**
 * A nudge to sign, where players manage their team. Nothing replaces the
 * waiver email Dropbox Sign used to send, so the prompt has to be where
 * players already go. Shows nothing once they have signed.
 */
export const WaiverPrompt = () => {
	const { isLoading, hasSignedWaiver, isBanned, isRostered } = useUserStatus()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const season = currentSeasonQueryDocumentSnapshot?.data()
	const [now] = useState(() => Date.now())

	if (isLoading || hasSignedWaiver || isBanned || !season) return null
	if (season.dateEnd.toMillis() < now) return null

	return (
		<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
			<FileSignature className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
			<AlertTitle className='!text-amber-900 dark:!text-amber-100'>
				Sign your waiver for {season.name}
			</AlertTitle>
			<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
				<p>
					{isRostered
						? `Your team registers once ${MIN_SIGNED_PLAYERS} players have signed. It takes a minute.`
						: 'It takes a minute, and you can do it before you join a team.'}
				</p>
				<Button asChild size='sm' className='mt-3'>
					<Link to='/waiver'>Sign waiver</Link>
				</Button>
			</AlertDescription>
		</Alert>
	)
}
