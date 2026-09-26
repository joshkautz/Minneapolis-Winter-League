import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCollection, useDocument } from 'react-firebase-hooks/firestore'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { CheckCircle, CreditCard, Info } from 'lucide-react'
import { useSeasonsContext, useTeamsContext } from '@/providers'
import { useUserStatus } from '@/shared/hooks/use-user-status'
import {
	LoadingButton,
	LoadingSpinner,
	NotificationCard,
	TeamContributionsList,
} from '@/shared/components'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cancelTeamContribution, startTeamContribution } from '@/firebase'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	teamContributionsQuery,
	teamOpenCheckoutsRef,
} from '@/firebase/collections/teams'
import {
	canonicalPlayerIdFromPlayerSeasonDoc,
	playerSeasonsOnTeamQuery,
} from '@/firebase/collections/players'
import {
	CENTS_PER_DOLLAR,
	paidByRosterCents,
	paidCents,
	contributionAmountError,
	formatDollars,
	formatTimestamp,
	MIN_SIGNED_PLAYERS,
	REGISTRATION_SPOTS,
	suggestedContributionsCents,
	usesTeamPayments,
	errorMessage,
} from '@/shared/utils'

/**
 * Shown above the pay button, so a payer knows before paying when they get
 * their money back. The same wording is on Stripe's page
 * (`createTeamContributionCheckout`).
 */
const PAYMENT_EXPLANATION =
	`Your card is charged now. If you leave the team before it registers, or ` +
	`it does not get one of the ${REGISTRATION_SPOTS} spots, you are refunded ` +
	`in full. Refunds take 5 to 10 business days to reach your card.`

/** Tells the payer how Checkout went, once, when Stripe sends them back. */
const usePaymentReturnToast = (): void => {
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const status = params.get('payment')
		if (status !== 'success' && status !== 'cancel') return

		if (status === 'success') {
			toast.success('Payment received', {
				description:
					'Your contribution will appear here in a moment. Thank you!',
			})
		} else {
			// Free the amount the checkout set aside, so teammates can pay it
			// now rather than when the session times out.
			void cancelTeamContribution()
			toast.info('Payment cancelled', {
				description: 'Nothing was charged. You can try again when ready.',
			})
		}
		params.delete('payment')
		const query = params.toString()
		window.history.replaceState(
			{},
			'',
			window.location.pathname + (query ? `?${query}` : '')
		)
	}, [])
}

const ContributeForm = ({ remainingCents }: { remainingCents: number }) => {
	const suggestions = useMemo(
		() => suggestedContributionsCents(remainingCents),
		[remainingCents]
	)
	const [dollars, setDollars] = useState(
		String((suggestions[0] ?? 0) / CENTS_PER_DOLLAR)
	)
	const [submitting, setSubmitting] = useState(false)

	// Pressing Back on Stripe's page can restore this page from the
	// back-forward cache exactly as it was left — spinning. Nothing is in
	// flight by then, so let the payer try again.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) setSubmitting(false)
		}
		window.addEventListener('pageshow', onPageShow)
		return () => window.removeEventListener('pageshow', onPageShow)
	}, [])

	const amountCents = Math.round(Number(dollars) * CENTS_PER_DOLLAR)
	const error =
		dollars.trim() === ''
			? 'Enter an amount in dollars.'
			: contributionAmountError(amountCents, remainingCents)

	const submit = async () => {
		if (error || submitting) return
		setSubmitting(true)
		const failure = await startTeamContribution(amountCents)
		if (failure) {
			setSubmitting(false)
			toast.error('Could not start the payment', { description: failure })
		}
	}

	return (
		<div className='space-y-3'>
			<div className='flex flex-wrap gap-2'>
				{suggestions.map((cents) => (
					<Button
						key={cents}
						type='button'
						size='sm'
						variant={amountCents === cents ? 'default' : 'outline'}
						onClick={() => setDollars(String(cents / CENTS_PER_DOLLAR))}
					>
						{cents === remainingCents
							? `All ${formatDollars(cents)}`
							: formatDollars(cents)}
					</Button>
				))}
			</div>

			<div className='space-y-1'>
				<Label htmlFor='contribution-amount'>Amount (dollars)</Label>
				<Input
					id='contribution-amount'
					inputMode='numeric'
					type='number'
					min={1}
					step={1}
					value={dollars}
					onChange={(event) => setDollars(event.target.value)}
					aria-invalid={Boolean(error)}
					aria-describedby='contribution-amount-error'
				/>
				{error && (
					<p
						id='contribution-amount-error'
						className='text-sm text-destructive'
					>
						{error}
					</p>
				)}
			</div>

			<p className='text-sm text-muted-foreground'>{PAYMENT_EXPLANATION}</p>

			<LoadingButton
				onClick={submit}
				disabled={Boolean(error)}
				loading={submitting}
				loadingText='Opening Stripe...'
				className='w-full'
			>
				<CreditCard className='h-4 w-4' aria-hidden='true' />
				{error ? 'Contribute' : `Contribute ${formatDollars(amountCents)}`}
			</LoadingButton>
		</div>
	)
}

/**
 * The team's registration payment: what is paid, what is left, who
 * paid, and a way to contribute. Only for seasons on team payments, and
 * only readable by the team's own roster.
 */
export const TeamPaymentCard = () => {
	usePaymentReturnToast()

	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonData, isBanned, isAdmin, authStateUser } =
		useUserStatus()

	const season = currentSeasonQueryDocumentSnapshot?.data()
	const seasonId = currentSeasonQueryDocumentSnapshot?.id
	const teamRef = currentSeasonData?.team ?? undefined
	const teamId = teamRef?.id
	const teamPayments = usesTeamPayments(season)

	const teamSeason = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs
				.find((doc) => canonicalTeamIdFromTeamSeasonDoc(doc) === teamId)
				?.data(),
		[currentSeasonTeamsQuerySnapshot, teamId]
	)

	const [contributionsSnapshot, contributionsLoading, contributionsError] =
		useCollection(
			teamPayments && teamId && seasonId
				? teamContributionsQuery(teamId, seasonId)
				: undefined
		)
	const [openCheckoutsSnapshot] = useDocument(
		teamPayments && teamId && seasonId
			? teamOpenCheckoutsRef(teamId, seasonId)
			: undefined
	)
	const [playerSeasonsSnapshot, playerSeasonsLoading] = useCollection(
		teamPayments ? playerSeasonsOnTeamQuery(teamRef) : undefined
	)

	// This season's roster. A player-season's id is its season id, so
	// `doc.id` here is the season — which is what this filters on — and the
	// player comes from its parent.
	const rosterSeasons = useMemo(
		() => playerSeasonsSnapshot?.docs.filter((doc) => doc.id === seasonId),
		[playerSeasonsSnapshot, seasonId]
	)
	const rosterPlayerIds = useMemo(
		() => new Set(rosterSeasons?.map(canonicalPlayerIdFromPlayerSeasonDoc)),
		[rosterSeasons]
	)
	const signedPlayers =
		rosterSeasons?.filter((doc) => doc.data().signed).length ?? 0

	useEffect(() => {
		if (contributionsError) {
			toast.error('Could not load your team’s payments', {
				description: errorMessage(
					contributionsError,
					'Please reload the page to try again.'
				),
			})
		}
	}, [contributionsError])

	if (!teamPayments || !season) return null

	const totalCents = season.teamRegistrationTotalCents
	const contributions = contributionsSnapshot?.docs ?? []
	const registered = teamSeason?.registered === true
	// Before registering, only the current roster's money counts, as on the
	// server. After, all of it is the team's: registration is final.
	const paid = registered
		? paidCents(contributions.map((doc) => doc.data()))
		: paidByRosterCents(
				contributions.map((doc) => doc.data()),
				rosterPlayerIds
			)
	const remainingCents = Math.max(0, totalCents - paid)

	const now = Timestamp.now()

	// What teammates are paying on Stripe's page right now is set aside for
	// them, so nobody else can pay the same dollars. The payer's own checkout
	// does not count against them: opening another replaces it. A
	// reservation past its time is left out here; the server asks Stripe.
	const othersPaying = Object.values(
		openCheckoutsSnapshot?.data()?.reservations ?? {}
	).filter(
		(reservation) =>
			reservation.player.id !== authStateUser?.uid &&
			reservation.expiresAt.toMillis() > now.toMillis()
	)
	const reservedByOthersCents = othersPaying.reduce(
		(sum, reservation) => sum + reservation.amountCents,
		0
	)
	const availableCents = Math.max(0, remainingCents - reservedByOthersCents)
	const freesUpAt = othersPaying.length
		? new Date(
				Math.max(...othersPaying.map((r) => r.expiresAt.toMillis()))
			).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
		: null

	const notOpenYet = now < season.registrationStart
	const closed = now > season.registrationEnd
	const full = (season.registeredTeamCount ?? 0) >= REGISTRATION_SPOTS

	let status: ReactNode
	if (registered) {
		status = (
			<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
				<CheckCircle className='h-4 w-4 !text-green-600 dark:!text-green-400' />
				<AlertDescription className='!text-green-800 dark:!text-green-200'>
					Your team is registered for {season.name}.
				</AlertDescription>
			</Alert>
		)
	} else if (full || closed) {
		status = (
			<Alert>
				<Info className='h-4 w-4' />
				<AlertDescription>
					{full
						? `All ${REGISTRATION_SPOTS} spots have been taken.`
						: `Registration closed on ${formatTimestamp(season.registrationEnd)}.`}{' '}
					Everything your team paid is refunded in full, automatically. Refunds
					take 5 to 10 business days to reach each card.
				</AlertDescription>
			</Alert>
		)
	} else if (notOpenYet && !isAdmin) {
		status = (
			<Alert>
				<Info className='h-4 w-4' />
				<AlertDescription>
					Contributions open with registration on{' '}
					{formatTimestamp(season.registrationStart)}.
				</AlertDescription>
			</Alert>
		)
	} else if (remainingCents === 0) {
		status = (
			<Alert>
				<Info className='h-4 w-4' />
				<AlertDescription>
					Your team has paid the full amount. It registers as soon as{' '}
					{MIN_SIGNED_PLAYERS} players have signed their waiver.
				</AlertDescription>
			</Alert>
		)
	} else if (isBanned) {
		status = null
	} else if (availableCents === 0) {
		status = (
			<Alert>
				<Info className='h-4 w-4' />
				<AlertDescription>
					A teammate is paying the rest of the team’s total right now. If they
					do not finish, it becomes available again by {freesUpAt}.
				</AlertDescription>
			</Alert>
		)
	} else {
		status = (
			<div className='space-y-3'>
				{notOpenYet && (
					// Only an admin gets here: the server lets admins contribute
					// before registration opens, to try the flow for real.
					<Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
						<Info className='h-4 w-4 !text-amber-600 dark:!text-amber-400' />
						<AlertDescription className='!text-amber-800 dark:!text-amber-200'>
							Registration opens {formatTimestamp(season.registrationStart)}. As
							an admin you can contribute early to test. It is a real charge on
							your card: refund it from Team Management, Payments. Stripe keeps
							its processing fee.
						</AlertDescription>
					</Alert>
				)}
				{reservedByOthersCents > 0 && (
					<p className='text-sm text-muted-foreground'>
						A teammate is paying {formatDollars(reservedByOthersCents)} right
						now, so {formatDollars(availableCents)} is left for everyone else.
					</p>
				)}
				<ContributeForm remainingCents={availableCents} />
			</div>
		)
	}

	return (
		<NotificationCard
			title='Team Registration'
			description={`Your team registers once ${MIN_SIGNED_PLAYERS} players have signed their waiver and ${formatDollars(totalCents)} has been paid, split however you like. Only your teammates can see this.`}
			className='max-w-none'
		>
			{contributionsLoading || playerSeasonsLoading ? (
				<LoadingSpinner size='sm' />
			) : (
				<div className='space-y-5'>
					<div className='space-y-3'>
						<div className='space-y-1'>
							<div className='flex justify-between text-sm'>
								<span>Paid</span>
								<span className='tabular-nums'>
									{formatDollars(Math.min(paid, totalCents))} of{' '}
									{formatDollars(totalCents)}
								</span>
							</div>
							<Progress
								value={Math.min(100, (paid / totalCents) * 100)}
								aria-label='Money paid'
							/>
						</div>
						<div className='space-y-1'>
							<div className='flex justify-between text-sm'>
								<span>Players signed</span>
								<span className='tabular-nums'>
									{Math.min(signedPlayers, MIN_SIGNED_PLAYERS)} of{' '}
									{MIN_SIGNED_PLAYERS}
								</span>
							</div>
							<Progress
								value={Math.min(
									100,
									(signedPlayers / MIN_SIGNED_PLAYERS) * 100
								)}
								aria-label='Players signed'
							/>
						</div>
					</div>

					{status}

					<div className='space-y-2'>
						<h4 className='text-sm font-medium'>Contributions</h4>
						<TeamContributionsList
							contributions={contributions}
							emptyMessage='Nobody has contributed yet.'
						/>
					</div>
				</div>
			)}
		</NotificationCard>
	)
}
