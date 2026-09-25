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
import {
	LoadingButton,
	LoadingSpinner,
	TeamContributionsList,
} from '@/shared/components'
import { useQueryErrorHandler } from '@/shared/hooks'
import { teamContributionsQuery } from '@/firebase/collections/teams'
import { refundTeamContributionViaFunction } from '@/firebase/collections/functions'
import { formatDollars, paidCents, errorMessage } from '@/shared/utils'
import type { TeamContributionDocument } from '@/types'

/** Longest refund reason the callable accepts. */
const MAX_REASON_LENGTH = 500

interface TeamPaymentsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamId: string
	teamName: string
	seasonId: string
}

/**
 * An admin's view of one team's payments, with a manual refund for the cases
 * the settlement rules do not cover — a dispute, a test payment, a payer who
 * should not have been charged. A refund never changes the team's
 * registration.
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

	const [refunding, setRefunding] =
		useState<QueryDocumentSnapshot<TeamContributionDocument> | null>(null)
	const [reason, setReason] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const contributions = snapshot?.docs ?? []
	const heldCents = paidCents(contributions.map((doc) => doc.data()))

	const trimmedReason = reason.trim()
	const reasonError =
		trimmedReason.length === 0
			? 'Say why, for the record.'
			: trimmedReason.length > MAX_REASON_LENGTH
				? `Keep it under ${MAX_REASON_LENGTH} characters.`
				: null

	const closeRefund = () => {
		// Stays open, spinner showing, until the refund settles.
		if (submitting) return
		setRefunding(null)
		setReason('')
	}

	const refund = async () => {
		if (!refunding || reasonError || submitting) return
		setSubmitting(true)
		try {
			await refundTeamContributionViaFunction({
				teamId,
				seasonId,
				paymentIntentId: refunding.id,
				reason: trimmedReason,
			})
			toast.success('Payment refunded', {
				description: `${formatDollars(refunding.data().amountCents)} back to the payer.`,
			})
			setRefunding(null)
			setReason('')
		} catch (refundError) {
			toast.error('Could not refund this payment', {
				description: errorMessage(refundError, 'Please try again.'),
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
							{formatDollars(heldCents)} paid and not refunded.
						</DialogDescription>
					</DialogHeader>
					{loading ? (
						<LoadingSpinner size='sm' />
					) : (
						<TeamContributionsList
							contributions={contributions}
							emptyMessage='This team has no payments this season.'
							renderAction={(contribution) =>
								contribution.data().status === 'paid' ? (
									<Button
										size='sm'
										variant='outline'
										onClick={() => setRefunding(contribution)}
									>
										<Undo2 className='mr-2 h-4 w-4' aria-hidden='true' />
										Refund
									</Button>
								) : null
							}
						/>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={refunding !== null}
				onOpenChange={(isOpen) => !isOpen && closeRefund()}
			>
				<DialogContent aria-busy={submitting}>
					<DialogHeader>
						<DialogTitle>Refund this payment?</DialogTitle>
						<DialogDescription>
							{refunding &&
								`Refunds ${formatDollars(refunding.data().amountCents)} to the payer. Stripe keeps its processing fee.`}{' '}
							The team’s registration does not change; if it is registered, it
							will be short of its total.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-1'>
						<Label htmlFor='refund-reason'>Reason</Label>
						<Textarea
							id='refund-reason'
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder='For example: test payment by an admin.'
							disabled={submitting}
							aria-invalid={reason.length > 0 && Boolean(reasonError)}
						/>
						{reason.length > 0 && reasonError && (
							<p className='text-sm text-destructive'>{reasonError}</p>
						)}
					</div>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={closeRefund}
							disabled={submitting}
						>
							Cancel
						</Button>
						<LoadingButton
							variant='destructive'
							onClick={refund}
							disabled={Boolean(reasonError)}
							loading={submitting}
							loadingText='Refunding...'
						>
							Refund
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
