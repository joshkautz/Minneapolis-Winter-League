/**
 * The new-season announcement, sent to everyone who has ever played before
 * registration opens. It says teams pay together but not how much: the fee
 * is for the site to explain, where players see it in context.
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

export interface SeasonAnnouncementProps {
	seasonName: string
	/** e.g. "Thursday, October 1" */
	registrationOpens: string
	/** e.g. "Saturday, October 31" */
	registrationCloses: string
	/**
	 * Every game night, e.g. "November 7, 14 and 21, and December 5, 12
	 * and 19"; see gameNightsOf.
	 */
	gameNights: string
	/** Whether a Thanksgiving Saturday falls inside the season, and is off. */
	skipsThanksgiving: boolean
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
	gameNights,
	skipsThanksgiving,
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
				[
					'Game nights',
					`Saturdays from 6:00pm: ${gameNights}${skipsThanksgiving ? '. No games Thanksgiving weekend.' : ''}`,
				],
				['Where', <TextLink href={VENUE.MAP_URL}>{VENUE.NAME}</TextLink>],
			]}
		/>
		<Callout title='New this fall: teams pay together'>
			Instead of every player paying separately, each team pays one fee, split
			however it likes. Adding players lowers everyone&apos;s share, so carry
			the depth you need to show up every week.
		</Callout>
		<Paragraph>
			A team is registered once {minimumSignedPlayers} of its players have
			signed their waiver and the team fee is paid. The first {teamSpots} teams
			to do both are in. You can sign your waiver today, before you even join a
			team.
		</Paragraph>
		<PrimaryButton href={siteUrl}>Build your team</PrimaryButton>
		<Paragraph>See you on the field.</Paragraph>
	</EmailLayout>
)
