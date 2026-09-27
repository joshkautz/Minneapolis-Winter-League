/**
 * Every email the league sends: its category, subject, footer reason and
 * React template. The sender, the preview script and the tests all render
 * through here, so an email looks the same wherever it is built.
 */

import type { ReactElement } from 'react'
import type { EmailCategory } from '../types.js'
import type { EmailFooter } from './templates/EmailLayout.js'
import {
	SeasonAnnouncement,
	seasonAnnouncementSubject,
	type SeasonAnnouncementProps,
} from './templates/SeasonAnnouncement.js'
import { TestEmail, type TestEmailProps } from './templates/TestEmail.js'

/** What every template receives besides its own props. */
export interface EmailContext {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}

export interface TemplateDefinition<Props> {
	category: EmailCategory
	subject: (props: Props) => string
	/** Why the recipient got it, shown in the footer. */
	footerReason: string
	component: (props: Props & EmailContext) => ReactElement
	/** Realistic props for previews and tests. */
	sample: Props
}

const define = <Props,>(
	definition: TemplateDefinition<Props>
): TemplateDefinition<Props> => definition

export const TEMPLATES = {
	seasonAnnouncement: define<SeasonAnnouncementProps>({
		category: 'announcements',
		subject: seasonAnnouncementSubject,
		footerReason:
			'You are receiving this because you have played in the Minneapolis Winter League.',
		component: SeasonAnnouncement,
		sample: {
			seasonName: '2026 Fall',
			registrationOpens: 'Thursday, October 1',
			registrationCloses: 'Saturday, October 31',
			firstGame: 'Saturday, November 7',
			teamFee: '$1,000',
			teamSpots: 12,
			minimumSignedPlayers: 10,
		},
	}),
	testEmail: define<TestEmailProps>({
		category: 'account',
		subject: () => 'Test: email from mplswinterleague.com',
		footerReason:
			'You are receiving this because you are testing the league’s email.',
		component: TestEmail,
		sample: {
			message:
				'If this reached your inbox, the league can send email from mplswinterleague.com.',
		},
	}),
}

export type TemplateName = keyof typeof TEMPLATES

export type TemplateProps<Name extends TemplateName> =
	(typeof TEMPLATES)[Name] extends TemplateDefinition<infer Props>
		? Props
		: never

export const isTemplateName = (name: string): name is TemplateName =>
	Object.hasOwn(TEMPLATES, name)
