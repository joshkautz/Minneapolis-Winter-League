/**
 * Ban Reviews admin page
 *
 * Players whose waiver resembled a banned player's when they signed it
 * (`services/banEvasion.ts`), waiting for an admin to decide: the same
 * person under a new account, or someone else. Each shows which banned
 * account it resembles and what they share, never the details; both
 * players' waivers are in Player Management.
 */

import { useCollection } from 'react-firebase-hooks/firestore'
import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	DestructiveConfirmationDialog,
	LoadingButton,
	LoadingSpinner,
	PageContainer,
	PageHeader,
} from '@/shared/components'
import { openBanReviewsQuery } from '@/firebase/collections/players'
import { resolveBanReviewViaFunction } from '@/firebase/collections/functions'
import { usePendingAction, useQueryErrorHandler } from '@/shared/hooks'
import { errorMessage, formatTimestampWithTime } from '@/shared/utils'
import { BackToAdminButton } from '@/features/admin/shared'
import type { BanReviewDocument } from '@/types'

type Review = BanReviewDocument & { id: string }

/** "date of birth and mailing address", "a, b and c". */
const listed = (items: readonly string[]): string =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const ReviewCard = ({ review }: { review: Review }) => {
	// The review leaves the list through the listener once decided.
	const deciding = usePendingAction(false)

	const decide = (decision: 'ban' | 'dismiss') =>
		deciding.run(async () => {
			try {
				await resolveBanReviewViaFunction({
					playerId: review.playerId,
					decision,
				})
				toast.success(
					decision === 'ban'
						? `${review.playerName} is banned`
						: `${review.playerName} is marked as someone else`
				)
				return true
			} catch (error) {
				toast.error('Review not saved', {
					description: errorMessage(
						error,
						'The decision could not be saved. Please try again.'
					),
				})
				return false
			}
		})

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<Link to={`/players/${review.playerId}`} className='hover:underline'>
						{review.playerName}
					</Link>
				</CardTitle>
				<CardDescription>
					Flagged {formatTimestampWithTime(review.flaggedAt) ?? 'just now'} when
					they signed the waiver
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				<ul className='space-y-2 text-sm'>
					{review.matches.map((match) => (
						<li key={match.bannedPlayerId}>
							Resembles banned player{' '}
							<Link
								to={`/players/${match.bannedPlayerId}`}
								className='font-medium hover:underline'
							>
								{match.bannedPlayerName}
							</Link>
							: same {listed(match.signals)}.
						</li>
					))}
				</ul>
				<p className='text-sm text-muted-foreground'>
					Compare their waivers in Player Management before deciding.
				</p>
				<div className='flex flex-wrap gap-2'>
					<DestructiveConfirmationDialog
						title={`Ban ${review.playerName}?`}
						description='They are banned league-wide, as the account they resemble is: they cannot join a team or be emailed. You can lift it in Player Management.'
						continueText='Ban'
						onConfirm={() => decide('ban')}
					>
						<LoadingButton
							variant='destructive'
							size='sm'
							loading={deciding.pending}
							loadingText='Saving...'
						>
							Ban this account
						</LoadingButton>
					</DestructiveConfirmationDialog>
					<LoadingButton
						variant='outline'
						size='sm'
						onClick={() => decide('dismiss')}
						loading={deciding.pending}
						loadingText='Saving...'
					>
						Not the same person
					</LoadingButton>
				</div>
			</CardContent>
		</Card>
	)
}

export const BanReviews = () => {
	const [snapshot, loading, error] = useCollection(openBanReviewsQuery())
	useQueryErrorHandler({
		error,
		component: 'BanReviews',
		errorLabel: 'ban reviews',
	})

	const reviews: Review[] = (snapshot?.docs ?? [])
		.map((doc) => ({ ...doc.data(), id: doc.id }))
		.sort(
			(a, b) => (b.flaggedAt?.toMillis() ?? 0) - (a.flaggedAt?.toMillis() ?? 0)
		)

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Ban Reviews'
				description='New waivers that resemble a banned player’s, for you to decide'
				icon={ShieldAlert}
			/>
			<div className='flex items-center justify-between gap-4'>
				<BackToAdminButton />
			</div>
			{loading ? (
				<LoadingSpinner size='lg' centered />
			) : reviews.length === 0 ? (
				<Alert>
					<AlertDescription>
						Nothing to review. When someone signs a waiver that shares two or
						more things with a banned player&apos;s — a name, date of birth,
						address, emergency contact phone or the network they signed from —
						it appears here and the admins are emailed.
					</AlertDescription>
				</Alert>
			) : (
				reviews.map((review) => <ReviewCard key={review.id} review={review} />)
			)}
		</PageContainer>
	)
}
