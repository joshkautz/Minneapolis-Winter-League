/**
 * Receipts for team payments and their refunds, in place of Stripe's own
 * receipt emails. Each says where the team stands, which Stripe's cannot,
 * and links to Stripe's receipt page for the payment's official record.
 */

import type { ReactElement } from 'react'
import type { RefundCause } from '../../types.js'
import {
	Callout,
	EmailLayout,
	Facts,
	Heading,
	Paragraph,
	PrimaryButton,
	TextLink,
	type EmailFooter,
} from './EmailLayout.js'

interface EmailContextProps {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}

/** Where a team stands after a payment or refund. */
export interface TeamStanding {
	/** e.g. "$10.00" */
	paid: string
	/** e.g. "$1,000.00" */
	fee: string
	/** e.g. "$990.00"; "$0.00" once the fee is covered */
	remaining: string
	signedPlayers: number
	signedPlayersNeeded: number
}

export interface TeamPaymentReceiptProps {
	teamName: string
	seasonName: string
	/** e.g. "$10.00" */
	amount: string
	/** e.g. "Tuesday, September 29, 2026" */
	paidOn: string
	/** e.g. "Visa •••• 4242", or null when Stripe did not say */
	paymentMethod: string | null
	/** Stripe's receipt page, or null when Stripe did not give one */
	receiptUrl: string | null
	/** Whether the team had already registered when the receipt was sent */
	teamRegistered: boolean
	/** Null when the team no longer exists or has registered */
	standing: TeamStanding | null
}

/**
 * Why a refund was made: a settlement or admin cause recorded on the
 * contribution, `team-deleted` for a payment whose team was gone before it
 * could be recorded, or null when unknown (a refund made in Stripe).
 */
export type ReceiptRefundCause = RefundCause | 'team-deleted' | null

export interface TeamRefundReceiptProps {
	/** Null when the team's name is not known */
	teamName: string | null
	seasonName: string
	cause: ReceiptRefundCause
	/** Whether the team is registered */
	teamRegistered: boolean
	/** e.g. "$10.00" */
	amount: string
	refundedOn: string
	/** What was paid in the first place, e.g. "$500.00" */
	originallyPaid: string
	/** Whether this gave back everything that was paid */
	fullRefund: boolean
	receiptUrl: string | null
	standing: TeamStanding | null
}

/** "Chao World's", but "Frost Giants'". */
export const possessive = (name: string): string =>
	/s$/i.test(name) ? `${name}’` : `${name}’s`

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

/** A registered team is in; nothing else about it matters here. */
const RegisteredCallout = ({
	teamName,
	seasonName,
}: {
	teamName: string
	seasonName: string
}): ReactElement => (
	<Callout title={`${teamName} is registered`}>
		{teamName} has its spot in the {seasonName} season.
	</Callout>
)

/** One sentence each on the team's money and its signed players. */
const StandingCallout = ({
	teamName,
	standing,
}: {
	teamName: string
	standing: TeamStanding
}): ReactElement => {
	const feePaid = standing.remaining === '$0.00'
	const playersMissing = Math.max(
		standing.signedPlayersNeeded - standing.signedPlayers,
		0
	)
	return (
		<Callout title={`Where ${teamName} stands`}>
			{feePaid
				? `The ${standing.fee} team fee is fully paid.`
				: `${standing.paid} of the ${standing.fee} team fee is paid, with ${standing.remaining} to go.`}{' '}
			{playersMissing === 0
				? `All ${standing.signedPlayersNeeded} players it needs have signed their waivers.`
				: `${standing.signedPlayers} of the ${standing.signedPlayersNeeded} players it needs have signed their waivers.`}{' '}
			A team is in once both are done, while spots remain.
		</Callout>
	)
}

const StripeReceiptLink = ({
	url,
}: {
	url: string | null
}): ReactElement | null =>
	url ? (
		<Paragraph>
			Stripe, who processed the payment, keeps the official record:{' '}
			<TextLink href={url}>view the Stripe receipt</TextLink>.
		</Paragraph>
	) : null

export const teamPaymentReceiptSubject = ({
	amount,
	teamName,
}: TeamPaymentReceiptProps): string => `Receipt: ${amount} toward ${teamName}`

export const TeamPaymentReceipt = ({
	teamName,
	seasonName,
	amount,
	paidOn,
	paymentMethod,
	receiptUrl,
	teamRegistered,
	standing,
	recipientFirstName,
	siteUrl,
	footer,
}: TeamPaymentReceiptProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview={`Your ${amount} payment toward ${teamName} is in.`}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>Thanks for paying toward {teamName}</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			We received your {amount} payment toward {possessive(teamName)}{' '}
			{seasonName} registration.
		</Paragraph>
		<Facts
			rows={[
				['Amount paid', amount],
				['Paid on', paidOn],
				...(paymentMethod
					? [['Payment method', paymentMethod] as [string, string]]
					: []),
				['For', `Team registration: ${teamName}, ${seasonName}`],
			]}
		/>
		{teamRegistered ? (
			<RegisteredCallout teamName={teamName} seasonName={seasonName} />
		) : (
			standing && <StandingCallout teamName={teamName} standing={standing} />
		)}
		<PrimaryButton href={`${siteUrl}/manage`}>See your team</PrimaryButton>
		<StripeReceiptLink url={receiptUrl} />
	</EmailLayout>
)

export const teamRefundReceiptSubject = ({
	amount,
	teamName,
}: TeamRefundReceiptProps): string =>
	teamName ? `Refund: ${amount} from ${teamName}` : `Refund: ${amount}`

/** Why the money came back, in a sentence; null when it is not known. */
function refundExplanation({
	cause,
	teamName,
	seasonName,
	amount,
	teamRegistered,
}: Pick<
	TeamRefundReceiptProps,
	'cause' | 'teamName' | 'seasonName' | 'amount' | 'teamRegistered'
>): string | null {
	const team = teamName ?? 'your team'
	switch (cause) {
		case 'excess':
			return `${possessive(team)} fee was already covered, so we refunded the extra ${amount}.`
		case 'left-team':
			return teamRegistered
				? `You left ${team}, and the rest of the team covers its fee without your payment.`
				: `You left ${team} before it registered, so your payment no longer counts toward it.`
		case 'season-full':
			return `Every team spot in the ${seasonName} season filled before ${team} registered, so its payments have been refunded.`
		case 'registration-closed':
			return `Registration for the ${seasonName} season closed before ${team} registered, so its payments have been refunded.`
		case 'team-deleted':
			return `${teamName ?? 'The team you paid toward'} no longer existed when your payment went through, so it was refunded straight away.`
		case 'admin':
			return 'A league admin refunded it.'
		default:
			return null
	}
}

/** Whether the team can still register, so its standing is worth showing. */
const stillInPlay = (cause: ReceiptRefundCause): boolean =>
	cause === null || cause === 'admin' || cause === 'excess'

export const TeamRefundReceipt = ({
	teamName,
	seasonName,
	cause,
	teamRegistered,
	amount,
	refundedOn,
	originallyPaid,
	fullRefund,
	receiptUrl,
	standing,
	recipientFirstName,
	siteUrl,
	footer,
}: TeamRefundReceiptProps & EmailContextProps): ReactElement => {
	const reason = refundExplanation({
		cause,
		teamName,
		seasonName,
		amount,
		teamRegistered,
	})
	const showTeam = teamName !== null && stillInPlay(cause)
	return (
		<EmailLayout
			preview={reason ?? `${amount} is on its way back to you.`}
			siteUrl={siteUrl}
			footer={footer}
		>
			<Heading>Your refund is on its way</Heading>
			<Paragraph>{greeting(recipientFirstName)}</Paragraph>
			<Paragraph>
				{teamName
					? `We refunded ${fullRefund ? 'your' : `${amount} of your`} ${originallyPaid} payment toward ${possessive(teamName)} ${seasonName} registration.`
					: `We refunded your ${originallyPaid} payment toward a ${seasonName} team.`}{' '}
				{reason && `${reason} `}It usually reaches your card within 5 to 10
				business days.
			</Paragraph>
			<Facts
				rows={[
					['Refunded', amount],
					['Refunded on', refundedOn],
					['Originally paid', originallyPaid],
				]}
			/>
			{showTeam &&
				(teamRegistered ? (
					<RegisteredCallout teamName={teamName} seasonName={seasonName} />
				) : (
					standing && (
						<StandingCallout teamName={teamName} standing={standing} />
					)
				))}
			{showTeam && (
				<PrimaryButton href={`${siteUrl}/manage`}>See your team</PrimaryButton>
			)}
			<StripeReceiptLink url={receiptUrl} />
		</EmailLayout>
	)
}
