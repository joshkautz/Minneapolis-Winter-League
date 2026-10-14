import { useMemo } from 'react'
import { Timestamp, type DocumentReference } from 'firebase/firestore'
import { useCollection } from 'react-firebase-hooks/firestore'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { remindUnsignedTeammatesViaFunction } from '@/firebase/collections/functions'
import {
	canonicalPlayerIdFromPlayerSeasonDoc,
	playerSeasonsOnTeamQuery,
} from '@/firebase/collections/players'
import { LoadingButton } from '@/shared/components'
import {
	usePendingAction,
	useQueryErrorHandler,
	useRerenderAt,
} from '@/shared/hooks'
import { errorMessage, formatTimestampWithTime } from '@/shared/utils'
import { WAIVER_REMINDER_COOLDOWN_MS } from '@/shared/waiver'

/**
 * A captain's button to email every teammate who has not signed this
 * season's waiver. A team sends one round a day, whichever captain sends
 * it; until then the button says when the last went and when the next can.
 * The server enforces the same, so this only spares a pointless click.
 */
export const WaiverReminderButton = ({
	teamRef,
	seasonId,
	selfId,
	sentAt,
}: {
	teamRef: DocumentReference
	seasonId: string
	/** The captain, who is never sent their own reminder. */
	selfId: string
	/** When the team last sent reminders, from its team-season. */
	sentAt: Timestamp | null | undefined
}) => {
	const [playerSeasonsSnapshot, , playerSeasonsError] = useCollection(
		playerSeasonsOnTeamQuery(teamRef)
	)
	useQueryErrorHandler({
		error: playerSeasonsError,
		component: 'WaiverReminderButton',
		errorLabel: 'roster waivers',
	})

	// A player-season's id is its season id, so this keeps this season's
	// roster.
	const unsigned = useMemo(
		() =>
			playerSeasonsSnapshot?.docs.filter(
				(doc) =>
					doc.id === seasonId &&
					canonicalPlayerIdFromPlayerSeasonDoc(doc) !== selfId &&
					!doc.data().signed
			).length ?? 0,
		[playerSeasonsSnapshot, seasonId, selfId]
	)

	const nextAt = sentAt ? sentAt.toMillis() + WAIVER_REMINDER_COOLDOWN_MS : 0
	// Re-enables the button the moment a day has passed.
	useRerenderAt([nextAt])
	const coolingDown = nextAt > Timestamp.now().toMillis()

	// The send shows up through the team-season listener as `sentAt`.
	const sending = usePendingAction(coolingDown)

	if (unsigned === 0 && !coolingDown) return null

	const send = () =>
		sending.run(async () => {
			try {
				const { sent } = await remindUnsignedTeammatesViaFunction({
					teamId: teamRef.id,
				})
				toast.success('Reminder sent', {
					description: `${sent} ${sent === 1 ? 'teammate' : 'teammates'} who ${sent === 1 ? 'hasn’t' : 'haven’t'} signed the waiver will get an email.`,
				})
				return true
			} catch (error) {
				toast.error('Reminder not sent', {
					description: errorMessage(
						error,
						'The reminder could not be sent. Please try again.'
					),
				})
				return false
			}
		})

	return (
		<div className='space-y-1'>
			<LoadingButton
				variant='outline'
				size='sm'
				onClick={send}
				loading={sending.pending}
				loadingText='Sending...'
				disabled={coolingDown}
			>
				<Mail className='h-4 w-4 mr-2' aria-hidden='true' />
				{coolingDown
					? 'Reminder sent'
					: `Remind ${unsigned} unsigned ${unsigned === 1 ? 'teammate' : 'teammates'}`}
			</LoadingButton>
			{coolingDown && sentAt && (
				<p className='text-xs text-muted-foreground'>
					Sent {formatTimestampWithTime(sentAt)}. You can send another after{' '}
					{formatTimestampWithTime(Timestamp.fromMillis(nextAt))}.
				</p>
			)}
		</div>
	)
}
