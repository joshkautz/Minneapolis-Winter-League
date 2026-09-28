/**
 * The new-season announcement, sent to everyone who has ever played, the
 * day before registration opens.
 */

import type { ReactElement } from 'react'
import {
	Callout,
	EmailLayout,
	Facts,
	Heading,
	Paragraph,
	PrimaryButton,
	type EmailFooter,
} from './EmailLayout.js'

export interface SeasonAnnouncementProps {
	seasonName: string
	/** e.g. "Thursday, October 1" */
	registrationOpens: string
	/** e.g. "Saturday, October 31" */
	registrationCloses: string
	/** e.g. "Saturday, November 7" */
	firstGame: string
	/** e.g. "$1,000" */
	teamFee: string
	teamSpots: number
	minimumSignedPlayers: number
}

export interface SeasonAnnouncementEmailProps extends SeasonAnnouncementProps {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}

export const seasonAnnouncementSubject = ({
	seasonName,
	registrationOpens,
}: SeasonAnnouncementProps): string =>
	`${seasonName} registration opens ${registrationOpens}`

export const SeasonAnnouncement = ({
	seasonName,
	registrationOpens,
	registrationCloses,
	firstGame,
	teamFee,
	teamSpots,
	minimumSignedPlayers,
	recipientFirstName,
	siteUrl,
	footer,
}: SeasonAnnouncementEmailProps): ReactElement => (
	<EmailLayout
		preview={`Registration opens ${registrationOpens}. Get your team together for ${seasonName}.`}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>{seasonName} is almost here</Heading>
		<Paragraph>
			{recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,'}
		</Paragraph>
		<Paragraph>
			Winter League is back, and you can start building your team today: create
			one, invite players, or ask to join a team on the league site.
			Registration, when teams pay, opens {registrationOpens}, and there are{' '}
			{teamSpots} team spots.
		</Paragraph>
		<Facts
			rows={[
				['Build your team', 'Now'],
				['Registration', `${registrationOpens} – ${registrationCloses}`],
				['First games', `${firstGame}, from 6:00pm`],
				['Where', 'URW Sports Field Complex'],
			]}
		/>
		<Callout title='New this fall: teams pay together'>
			Instead of every player paying separately, each team pays one {teamFee}{' '}
			fee, split however it likes. Adding players lowers everyone&apos;s share,
			so carry the depth you need to show up every week.
		</Callout>
		<Paragraph>
			A team is registered once {minimumSignedPlayers} of its players have
			signed their waiver and the full {teamFee} is paid. The first {teamSpots}{' '}
			teams to do both are in. You can sign your waiver today, before you even
			join a team.
		</Paragraph>
		<PrimaryButton href={siteUrl}>Build your team</PrimaryButton>
		<Paragraph>See you on the field.</Paragraph>
	</EmailLayout>
)
