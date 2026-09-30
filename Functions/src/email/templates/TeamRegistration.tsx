/**
 * The two ways a team's registration ends: it takes a spot, or the season
 * fills or closes without it. Each goes to the whole roster.
 */

import type { ReactElement } from 'react'
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
import { VENUE } from '../../config/constants.js'

interface EmailContextProps {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}

export interface TeamRegisteredProps {
	teamName: string
	seasonName: string
	/** e.g. "November 7, 14 and 21, and December 5, 12 and 19"; null if unknown */
	gameNights: string | null
}

export interface TeamMissedOutProps {
	teamName: string
	seasonName: string
	reason: 'season-full' | 'registration-closed'
	/** Whether anyone had paid toward the team, and so is being refunded */
	refunding: boolean
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

export const teamRegisteredSubject = ({
	teamName,
	seasonName,
}: TeamRegisteredProps): string =>
	`${teamName} is registered for the ${seasonName} Season`

export const TeamRegistered = ({
	teamName,
	seasonName,
	gameNights,
	recipientFirstName,
	siteUrl,
	footer,
}: TeamRegisteredProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview={`${teamName} has its spot in the ${seasonName} Season.`}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>{teamName} is in</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			{teamName} has its fee paid and its players signed, and it has claimed a
			spot in the {seasonName} Season. You&apos;re registered.
		</Paragraph>
		<Facts
			rows={[
				...(gameNights
					? [
							['Game nights', `Saturdays from 6:00pm: ${gameNights}`] as [
								string,
								string,
							],
						]
					: []),
				['Where', <TextLink href={VENUE.MAP_URL}>{VENUE.NAME}</TextLink>],
			]}
		/>
		<PrimaryButton href={`${siteUrl}/manage`}>See your team</PrimaryButton>
		<Paragraph>See you on the field.</Paragraph>
	</EmailLayout>
)

export const teamMissedOutSubject = ({
	teamName,
	seasonName,
}: TeamMissedOutProps): string =>
	`${teamName} did not get a spot in the ${seasonName} Season`

export const TeamMissedOut = ({
	teamName,
	seasonName,
	reason,
	refunding,
	recipientFirstName,
	siteUrl,
	footer,
}: TeamMissedOutProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview={
			reason === 'season-full'
				? `Every spot in the ${seasonName} Season filled before ${teamName} registered.`
				: `Registration for the ${seasonName} Season closed before ${teamName} registered.`
		}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>{teamName} did not get a spot</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			{reason === 'season-full'
				? `Every team spot in the ${seasonName} Season filled before ${teamName} had its fee paid and ten players signed, so ${teamName} will not play this season.`
				: `Registration for the ${seasonName} Season closed before ${teamName} had its fee paid and ten players signed, so ${teamName} will not play this season.`}
		</Paragraph>
		{refunding && (
			<Callout title='Payments are being refunded'>
				Everyone who paid toward {teamName} is being refunded in full, and gets
				a receipt when their refund goes through.
			</Callout>
		)}
		<Paragraph>
			We&apos;re sorry it did not work out this time, and we hope to see you
			next season.
		</Paragraph>
		<PrimaryButton href={`${siteUrl}/teams`}>
			See this season&apos;s teams
		</PrimaryButton>
	</EmailLayout>
)
