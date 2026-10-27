/**
 * The Thursday email before each game night: the team's games that
 * Saturday, where it stands, and what the night decides. One per rostered
 * player, from `emailGameNightsWeekly`.
 */

import type { ReactElement } from 'react'
import { VENUE } from '../../config/constants.js'
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

export interface GameNightGame {
	/** e.g. "6:45 PM", on Minneapolis's clock */
	time: string
	field: number
	/** Null while the playoffs have still to decide it. */
	opponent: string | null
}

export interface GameNightProps {
	teamName: string
	seasonName: string
	/** e.g. "Saturday, November 14" */
	nightDate: string
	/** e.g. "Week 2", "Pool night", "Championship night" */
	nightLabel: string
	games: GameNightGame[]
	/** e.g. "Goop is 3–1, 2nd of 12 teams." Null before the first game. */
	standing: string | null
	/** What the night decides, or how a later game is set; null if nothing. */
	note: string | null
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

export const gameNightSubject = ({
	teamName,
	nightLabel,
	nightDate,
}: GameNightProps): string =>
	`${teamName}: ${nightLabel}, ${nightDate.replace(/^\w+, /, '')}`

export const GameNight = ({
	teamName,
	seasonName,
	nightDate,
	nightLabel,
	games,
	standing,
	note,
	recipientFirstName,
	siteUrl,
	footer,
}: GameNightProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview={`${teamName} plays ${games.map((game) => game.time).join(' and ')} on ${nightDate}.`}
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>
			{nightLabel}: {nightDate}
		</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			Here&apos;s what {teamName} has on {nightDate} in {seasonName}.
		</Paragraph>
		<Facts
			rows={games.map((game): [string, string] => [
				`${game.time} · Field ${game.field}`,
				game.opponent
					? `against ${game.opponent}`
					: 'opponent set by the results before it',
			])}
		/>
		{note && <Callout title='What’s at stake'>{note}</Callout>}
		{standing && <Paragraph>{standing}</Paragraph>}
		<Paragraph>
			At <TextLink href={VENUE.MAP_URL}>{VENUE.NAME}</TextLink>. Times and
			opponents can change if a score is corrected, so the schedule on the site
			has the final word.
		</Paragraph>
		<PrimaryButton href={`${siteUrl}/schedule`}>See the schedule</PrimaryButton>
		<Paragraph>
			<TextLink href={`${siteUrl}/standings`}>See the standings</TextLink>
		</Paragraph>
	</EmailLayout>
)
