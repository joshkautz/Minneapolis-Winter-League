import { useState } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner, TeamContributionsList } from '@/shared/components'
import { useQueryErrorHandler } from '@/shared/hooks'
import { teamContributionsQuery } from '@/firebase/collections/teams'
import { releaseTeamContributionViaFunction } from '@/firebase/collections/functions'
import { formatDollars, totalsFrom } from '@/shared/utils'
import type { TeamContributionDocument } from '@/types'

/** Longest release reason the callable accepts. */
const MAX_REASON_LENGTH = 500

interface TeamPaymentsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamId: string
	teamName: string
	seasonId: string
}

/**
 * An admin's view of one team's payments, with a manual release for the
 * cases the settlement rules do not cover — a dispute, a payer who left the
 * team. Releasing cancels a hold or refunds a capture; it never changes the
 * team's registration.
 */
export const TeamPaymentsDialog = ({
	open,
	onOpenChange,
	teamId,
	teamName,
	seasonId,
}: TeamPaymentsDialogProps) => {
	const [snapshot, loading, error] = useCollection(
		open ? teamContributionsQuery(teamId, seasonId) : null
	)
	useQueryErrorHandler({
		error,
		component: 'TeamPaymentsDialog',
		errorLabel: 'team payments',
	})

	const [releasing, setReleasing] =
		useState<QueryDocumentSnapshot<TeamContributionDocument> | null>(null)
	const [reason, setReason] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const contributions = snapshot?.docs ?? []
	const { authorizedCents, capturedCents } = totalsFrom(
		contributions.map((doc) => doc.data())
	)

	const trimmedReason = reason.trim()
	const reasonError =
		trimmedReason.length === 0
			? 'Say why, for the record.'
			: trimmedReason.length > MAX_REASON_LENGTH
				? `Keep it under ${MAX_REASON_LENGTH} characters.`
				: null

	const closeRelease = () => {
		setReleasing(null)
		setReason('')
	}

	const release = async () => {
		if (!releasing || reasonError) return
		setSubmitting(true)
		try {
			const result = await releaseTeamContributionViaFunction({
				teamId,
				seasonId,
				paymentIntentId: releasing.id,
				reason: trimmedReason,
			})
			toast.success(
				result.status === 'canceled' ? 'Hold released' : 'Payment refunded',
				{
					description: `${formatDollars(releasing.data().amountCents)} to the payer.`,
				}
			)
			closeRelease()
		} catch (releaseError) {
			toast.error('Could not release this payment', {
				description:
					releaseError instanceof Error
						? releaseError.message
						: 'Please try again.',
			})
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='sm:max-w-2xl'>
					<DialogHeader>
						<DialogTitle>{teamName} payments</DialogTitle>
						<DialogDescription>
							{formatDollars(capturedCents)} charged,{' '}
							{formatDollars(authorizedCents)} held on cards and not yet
							charged.
						</DialogDescription>
					</DialogHeader>
					{loading ? (
						<LoadingSpinner size='sm' />
					) : (
						<TeamContributionsList
							contributions={contributions}
							emptyMessage='This team has no payments this season.'
							renderAction={(contribution) => {
								const status = contribution.data().status
								if (status !== 'authorized' && status !== 'captured') {
									return null
								}
								return (
									<Button
										size='sm'
										variant='outline'
										onClick={() => setReleasing(contribution)}
									>
										<Undo2 className='mr-2 h-4 w-4' />
										{status === 'authorized' ? 'Release' : 'Refund'}
									</Button>
								)
							}}
						/>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={releasing !== null}
				onOpenChange={(isOpen) => !isOpen && closeRelease()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{releasing?.data().status === 'authorized'
								? 'Release this hold?'
								: 'Refund this payment?'}
						</DialogTitle>
						<DialogDescription>
							{releasing &&
								(releasing.data().status === 'authorized'
									? `Cancels the ${formatDollars(releasing.data().amountCents)} hold. The payer is never charged.`
									: `Refunds ${formatDollars(releasing.data().amountCents)}. Stripe keeps its processing fee.`)}{' '}
							The team’s registration does not change; if it is registered, it
							will be short of its total.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-1'>
						<Label htmlFor='release-reason'>Reason</Label>
						<Textarea
							id='release-reason'
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder='For example: payer left the team before it registered.'
							aria-invalid={reason.length > 0 && Boolean(reasonError)}
						/>
						{reason.length > 0 && reasonError && (
							<p className='text-sm text-destructive'>{reasonError}</p>
						)}
					</div>
					<DialogFooter>
						<Button variant='outline' onClick={closeRelease}>
							Cancel
						</Button>
						<Button
							variant='destructive'
							onClick={release}
							disabled={Boolean(reasonError) || submitting}
						>
							{submitting && <LoadingSpinner size='sm' className='mr-2' />}
							{releasing?.data().status === 'authorized'
								? 'Release hold'
								: 'Refund'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
