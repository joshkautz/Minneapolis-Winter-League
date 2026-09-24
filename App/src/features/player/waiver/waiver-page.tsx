import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle, FileSignature, Printer } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { signWaiverViaFunction } from '@/firebase/collections/functions'
import { useSeasonsContext } from '@/providers'
import { LoadingSpinner, PageContainer, PageHeader } from '@/shared/components'
import { useUserStatus } from '@/shared/hooks'
import {
	extractErrorMessage,
	formatTimestampWithTime,
	logger,
} from '@/shared/utils'
import {
	CURRENT_WAIVER_VERSION_ID,
	currentWaiverVersion,
	leagueToday,
} from '@/shared/waiver'
import { WaiverSignForm } from './waiver-sign-form'
import { toSubmission, type WaiverFormValues } from './waiver-form-schema'
import {
	lastSignedDetails,
	signatureForSeason,
	useWaiverSignatures,
} from './use-waiver-signatures'

/**
 * `/waiver` — read and sign the league waiver for the current season.
 *
 * A player can sign any time before the season ends, whether or not they
 * are on a team yet: it is one thing they can get out of the way early,
 * rather than an email they wait for after joining.
 */
export const WaiverPage = () => {
	const {
		isLoading: statusLoading,
		userSnapshot,
		hasSignedWaiver,
		isBanned,
		isEmailVerified,
		isRostered,
	} = useUserStatus()
	const { currentSeasonQueryDocumentSnapshot: seasonSnapshot } =
		useSeasonsContext()
	const { signatures, loading: signaturesLoading } = useWaiverSignatures(
		userSnapshot?.id
	)

	const season = seasonSnapshot?.data()
	const player = userSnapshot?.data()
	const participantName = player
		? `${player.firstname} ${player.lastname}`.trim()
		: ''
	// Read the clock once, when the page opens, rather than on every render.
	const [now] = useState(() => Date.now())
	const today = useMemo(() => leagueToday(new Date(now)), [now])
	const version = currentWaiverVersion()
	const thisSeasonsSignature = signatureForSeason(
		signatures,
		seasonSnapshot?.id
	)

	// A returning player's details, so signing again takes a few seconds.
	const defaultValues = useMemo((): Partial<WaiverFormValues> | undefined => {
		const last = lastSignedDetails(signatures)
		if (!last) return undefined
		return {
			dateOfBirth: last.dateOfBirth ?? '',
			mailingAddress: last.mailingAddress ?? '',
			emergencyContacts: last.emergencyContacts.length
				? last.emergencyContacts.map((contact) => ({ ...contact }))
				: undefined,
		}
	}, [signatures])

	const handleSubmit = async (values: WaiverFormValues): Promise<void> => {
		try {
			const result = await signWaiverViaFunction(
				toSubmission(values, CURRENT_WAIVER_VERSION_ID, today)
			)
			toast.success(result.alreadySigned ? 'Already signed' : 'Waiver signed', {
				description: result.alreadySigned
					? `You had already signed for ${season?.name ?? 'this season'}.`
					: `You're signed for ${season?.name ?? 'this season'}. Thanks!`,
			})
			window.scrollTo({ top: 0, behavior: 'smooth' })
		} catch (error) {
			logger.error('Signing the waiver failed', error, {
				component: 'WaiverPage',
			})
			toast.error('Could not sign the waiver', {
				description: extractErrorMessage(error, 'Please try again.'),
			})
		}
	}

	const header = (
		<PageHeader
			title='Waiver'
			description={
				season
					? `Waiver and Release of Liability for ${season.name}`
					: 'Waiver and Release of Liability'
			}
			icon={FileSignature}
		/>
	)

	if (statusLoading || signaturesLoading || !userSnapshot) {
		return <LoadingSpinner size='lg' centered />
	}

	const seasonEnded = season && season.dateEnd.toMillis() < now

	let body
	if (!season) {
		body = <Notice>There is no season to sign up for yet.</Notice>
	} else if (isBanned) {
		body = (
			<Notice tone='destructive'>
				Your account has been banned from Minneapolis Winter League.
			</Notice>
		)
	} else if (hasSignedWaiver) {
		body = (
			<Card className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
				<CardContent className='space-y-4 pt-6'>
					<div className='flex items-start gap-3'>
						<CheckCircle
							className='mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400'
							aria-hidden='true'
						/>
						<div className='space-y-1'>
							<p className='font-medium text-green-900 dark:text-green-100'>
								You're signed for {season.name}.
							</p>
							{thisSeasonsSignature?.signedAt && (
								<p className='text-sm text-green-800 dark:text-green-200'>
									Signed{' '}
									{formatTimestampWithTime(thisSeasonsSignature.signedAt)}.
								</p>
							)}
						</div>
					</div>
					<div className='flex flex-wrap gap-2'>
						{thisSeasonsSignature && (
							<Button asChild variant='outline'>
								<Link
									to={`/waiver/copy/${userSnapshot.id}/${thisSeasonsSignature.id}`}
								>
									<Printer className='h-4 w-4' aria-hidden='true' />
									View or print your copy
								</Link>
							</Button>
						)}
						<Button asChild>
							<Link to='/manage'>
								{isRostered ? 'Go to My Team' : 'Find a team'}
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		)
	} else if (seasonEnded) {
		body = (
			<Notice>
				{season.name} has ended. The waiver for the next season opens when it is
				announced.
			</Notice>
		)
	} else if (!isEmailVerified) {
		body = (
			<Notice>
				Verify your email address before signing.{' '}
				<Link to='/profile' className='font-medium underline'>
					Go to your profile
				</Link>{' '}
				to send a verification email.
			</Notice>
		)
	} else {
		body = (
			<WaiverSignForm
				version={version}
				participantName={participantName}
				today={today}
				defaultValues={defaultValues}
				onSubmit={handleSubmit}
			/>
		)
	}

	return (
		<PageContainer withSpacing withGap className='max-w-3xl'>
			{header}
			{body}
		</PageContainer>
	)
}

const Notice = ({
	children,
	tone = 'default',
}: {
	children: React.ReactNode
	tone?: 'default' | 'destructive'
}) => (
	<Alert variant={tone}>
		<AlertCircle className='h-4 w-4' aria-hidden='true' />
		<AlertDescription>{children}</AlertDescription>
	</Alert>
)
