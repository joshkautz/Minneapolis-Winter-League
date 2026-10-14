/**
 * A captain's nudge to a teammate who has not signed this season's waiver,
 * sent from the team page (`remindUnsignedTeammates`).
 */

import type { ReactElement } from 'react'
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

export interface WaiverReminderProps {
	teamName: string
	seasonName: string
	captainName: string
	/** Whether the team has registered; if not, its signed count matters. */
	teamRegistered: boolean
	signedPlayers: number
	signedPlayersNeeded: number
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

export const waiverReminderSubject = ({
	seasonName,
	teamName,
}: WaiverReminderProps): string =>
	`Sign your ${seasonName} waiver for ${teamName}`

export const WaiverReminder = ({
	teamName,
	seasonName,
	captainName,
	teamRegistered,
	signedPlayers,
	signedPlayersNeeded,
	recipientFirstName,
	siteUrl,
	footer,
}: WaiverReminderProps & EmailContextProps): ReactElement => {
	const stillNeeded = Math.max(signedPlayersNeeded - signedPlayers, 0)
	return (
		<EmailLayout
			preview={`${captainName} is asking you to sign the league’s waiver.`}
			siteUrl={siteUrl}
			footer={footer}
		>
			<Heading>Your waiver isn’t signed yet</Heading>
			<Paragraph>{greeting(recipientFirstName)}</Paragraph>
			<Paragraph>
				{captainName}, captain of {teamName}, is reminding you to sign the
				league’s waiver for {seasonName}. Every player signs it before they
				play, and it takes a couple of minutes on the site.
			</Paragraph>
			{!teamRegistered && stillNeeded > 0 && (
				<Paragraph>
					{teamName} has {signedPlayers} of the {signedPlayersNeeded} signed
					players it needs to register, so yours counts.
				</Paragraph>
			)}
			<PrimaryButton href={`${siteUrl}/waiver`}>Sign the waiver</PrimaryButton>
		</EmailLayout>
	)
}
