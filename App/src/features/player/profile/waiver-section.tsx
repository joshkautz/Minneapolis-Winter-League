import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle, FileSignature, Printer } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { QueryDocumentSnapshot } from '@/firebase'
import { formatTimestamp, SeasonDocument } from '@/shared/utils'
import {
	signatureForSeason,
	useWaiverSignatures,
} from '@/features/player/waiver'

interface WaiverSectionProps {
	playerId: string | undefined
	isAuthenticatedUserSigned: boolean | undefined
	isLoading: boolean
	isAuthenticatedUserBanned: boolean
	currentSeasonQueryDocumentSnapshot:
		QueryDocumentSnapshot<SeasonDocument> | undefined
}

/**
 * The player's waiver for the current season: signed, with a copy to keep,
 * or a way to sign it. Signing happens on `/waiver`, in the app.
 */
export const WaiverSection = ({
	playerId,
	isAuthenticatedUserSigned,
	isLoading,
	isAuthenticatedUserBanned,
	currentSeasonQueryDocumentSnapshot,
}: WaiverSectionProps) => {
	const { signatures } = useWaiverSignatures(playerId)
	const season = currentSeasonQueryDocumentSnapshot?.data()
	const signature = signatureForSeason(
		signatures,
		currentSeasonQueryDocumentSnapshot?.id
	)

	return (
		<div className='space-y-3'>
			<h3 className='font-medium text-sm'>Waiver Signature</h3>

			{isLoading || isAuthenticatedUserSigned === undefined ? (
				<div className='text-sm text-muted-foreground'>
					Checking waiver status...
				</div>
			) : isAuthenticatedUserBanned ? (
				<Alert className='border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'>
					<AlertCircle className='h-4 w-4 !text-red-600 dark:!text-red-400' />
					<AlertDescription className='!text-red-800 dark:!text-red-200'>
						Account has been banned from Minneapolis Winter League.
					</AlertDescription>
				</Alert>
			) : isAuthenticatedUserSigned ? (
				<div className='space-y-3'>
					<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
						<CheckCircle className='h-4 w-4 !text-green-600 dark:!text-green-400' />
						<AlertDescription className='!text-green-800 dark:!text-green-200'>
							Signed for {season?.name ?? 'this season'}
							{signature?.signedAt &&
								` on ${formatTimestamp(signature.signedAt)}`}
							.
						</AlertDescription>
					</Alert>
					{signature && playerId && (
						<Button asChild variant='outline' size='sm' className='w-full'>
							<Link to={`/waiver/copy/${playerId}/${signature.id}`}>
								<Printer className='h-4 w-4' aria-hidden='true' />
								View or print your copy
							</Link>
						</Button>
					)}
				</div>
			) : (
				<div className='space-y-3'>
					<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
						<FileSignature className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
						<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
							Sign the waiver to play in {season?.name ?? 'this season'}. It
							takes a minute, and you can do it before you join a team.
						</AlertDescription>
					</Alert>
					<Button asChild className='w-full'>
						<Link to='/waiver'>
							<FileSignature className='h-4 w-4' aria-hidden='true' />
							Sign waiver
						</Link>
					</Button>
				</div>
			)}
		</div>
	)
}
