/**
 * Tells the admins that a new waiver resembles a banned player's, so they
 * can look before the player gets on the field. Sent by `flagBanEvasion`.
 * It names the accounts and what they share, never the details.
 */

import type { ReactElement } from 'react'
import type { BanMatchSignal } from '../../types.js'
import {
	EmailLayout,
	Heading,
	Paragraph,
	PrimaryButton,
	type EmailFooter,
} from './EmailLayout.js'

interface EmailContextProps {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}

export interface BanReviewAlertProps {
	/** The name on the new waiver. */
	playerName: string
	matches: { bannedPlayerName: string; signals: BanMatchSignal[] }[]
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

/** "date of birth and mailing address", "a, b and c". */
const listed = (items: readonly string[]): string =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

export const banReviewAlertSubject = ({
	playerName,
}: BanReviewAlertProps): string =>
	`Review: ${playerName} may be a banned player`

export const BanReviewAlert = ({
	playerName,
	matches,
	recipientFirstName,
	siteUrl,
	footer,
}: BanReviewAlertProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview={`${playerName}'s waiver resembles a banned player's.`}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>A waiver to review</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			{playerName} just signed the league&apos;s waiver, and it has things in
			common with a banned player&apos;s records:
		</Paragraph>
		{matches.map((match) => (
			<Paragraph key={match.bannedPlayerName}>
				<strong>{match.bannedPlayerName}</strong>: same {listed(match.signals)}.
			</Paragraph>
		))}
		<Paragraph>
			Their waiver was signed as usual. Decide whether this is the same person:
			ban the new account, or mark it as someone else.
		</Paragraph>
		<PrimaryButton href={`${siteUrl}/admin/ban-reviews`}>
			Review it
		</PrimaryButton>
	</EmailLayout>
)
