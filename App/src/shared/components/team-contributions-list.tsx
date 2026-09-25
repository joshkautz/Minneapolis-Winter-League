import type { ReactNode } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useDocument } from 'react-firebase-hooks/firestore'
import { Badge } from '@/components/ui/badge'
import {
	CONTRIBUTION_STATUS_LABELS,
	formatDollars,
	formatTimestamp,
} from '@/shared/utils'
import type { ContributionStatus, TeamContributionDocument } from '@/types'

/**
 * A team's payments toward its registration total: who, how much, and where
 * each one stands. Shown to the team on its own page and to admins, the only
 * two audiences the ledger is readable by.
 */

const STATUS_VARIANTS: Record<
	ContributionStatus,
	'default' | 'secondary' | 'outline'
> = {
	paid: 'secondary',
	refunded: 'outline',
}

const STATUS_HINTS: Record<ContributionStatus, string> = {
	paid: 'Charged toward the team’s total',
	refunded: 'Charged and refunded in full',
}

const PayerName = ({
	contribution,
}: {
	contribution: TeamContributionDocument
}) => {
	const [playerSnapshot] = useDocument(contribution.player)
	const player = playerSnapshot?.data()
	return (
		<span className='font-medium'>
			{player ? `${player.firstname} ${player.lastname}` : 'A teammate'}
		</span>
	)
}

export const TeamContributionsList = ({
	contributions,
	renderAction,
	emptyMessage = 'No contributions yet.',
}: {
	contributions: QueryDocumentSnapshot<TeamContributionDocument>[]
	/** Extra control per row — the admin's refund button. */
	renderAction?: (
		contribution: QueryDocumentSnapshot<TeamContributionDocument>
	) => ReactNode
	emptyMessage?: string
}) => {
	if (contributions.length === 0) {
		return <p className='text-sm text-muted-foreground'>{emptyMessage}</p>
	}

	return (
		<ul className='divide-y'>
			{contributions.map((snapshot) => {
				const contribution = snapshot.data()
				const isLive = contribution.status === 'paid'
				const partlyRefunded =
					contribution.paidAmountCents !== undefined &&
					contribution.paidAmountCents !== contribution.amountCents
				return (
					<li
						key={snapshot.id}
						className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'
					>
						<div className='min-w-0 flex-1'>
							<PayerName contribution={contribution} />
							<p className='text-xs text-muted-foreground'>
								{formatTimestamp(contribution.createdAt)}
								{contribution.refundReason &&
									` · Refunded by an admin: ${contribution.refundReason}`}
							</p>
						</div>
						<div className='text-right'>
							<p
								className={
									isLive
										? 'font-medium tabular-nums'
										: 'tabular-nums text-muted-foreground line-through'
								}
							>
								{formatDollars(contribution.amountCents)}
							</p>
							{isLive && partlyRefunded && (
								<p className='text-xs text-muted-foreground'>
									of {formatDollars(contribution.paidAmountCents ?? 0)} paid;
									the rest refunded
								</p>
							)}
						</div>
						<Badge
							variant={STATUS_VARIANTS[contribution.status]}
							title={STATUS_HINTS[contribution.status]}
							className='select-none'
						>
							{CONTRIBUTION_STATUS_LABELS[contribution.status]}
						</Badge>
						{renderAction?.(snapshot)}
					</li>
				)
			})}
		</ul>
	)
}
