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
import {
	TeamMissedOut,
	teamMissedOutSubject,
	TeamRegistered,
	teamRegisteredSubject,
	type TeamMissedOutProps,
	type TeamRegisteredProps,
} from './templates/TeamRegistration.js'
import {
	TeamPaymentReceipt,
	teamPaymentReceiptSubject,
	TeamRefundReceipt,
	teamRefundReceiptSubject,
	type TeamPaymentReceiptProps,
	type TeamRefundReceiptProps,
} from './templates/Receipts.js'
import {
	TeamInvitation,
	TeamInvitationAccepted,
	teamInvitationAcceptedSubject,
	TeamInvitationDeclined,
	teamInvitationDeclinedSubject,
	teamInvitationSubject,
	TeamJoinRequest,
	teamJoinRequestSubject,
	TeamRequestAccepted,
	teamRequestAcceptedSubject,
	TeamRequestDeclined,
	teamRequestDeclinedSubject,
	TeamInvitationWithdrawn,
	teamInvitationWithdrawnSubject,
	TeamRequestWithdrawn,
	teamRequestWithdrawnSubject,
	TeamPlayerJoinedElsewhere,
	teamPlayerJoinedElsewhereSubject,
	type TeamInvitationWithdrawnProps,
	type TeamRequestWithdrawnProps,
	type TeamPlayerJoinedElsewhereProps,
	type TeamInvitationAnsweredProps,
	type TeamInvitationProps,
	type TeamJoinRequestProps,
	type TeamRequestAnsweredProps,
} from './templates/TeamOffers.js'

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
			seasonName: 'Season 5',
			registrationOpens: 'Thursday, October 1',
			registrationCloses: 'Saturday, October 31',
			gameNights: 'November 7, 14 and 21, and December 5, 12 and 19',
			skipsThanksgiving: true,
			teamSpots: 12,
			minimumSignedPlayers: 10,
		},
	}),
	teamInvitation: define<TeamInvitationProps>({
		category: 'teams',
		subject: teamInvitationSubject,
		footerReason: 'You are receiving this because a captain invited you.',
		component: TeamInvitation,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			captainName: 'Sam Rivera',
		},
	}),
	teamJoinRequest: define<TeamJoinRequestProps>({
		category: 'teams',
		subject: teamJoinRequestSubject,
		footerReason: 'You are receiving this because you captain this team.',
		component: TeamJoinRequest,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			playerName: 'Alex Chen',
		},
	}),
	teamInvitationAccepted: define<TeamInvitationAnsweredProps>({
		category: 'teams',
		subject: teamInvitationAcceptedSubject,
		footerReason: 'You are receiving this because you captain this team.',
		component: TeamInvitationAccepted,
		sample: { teamName: 'Frost Giants', playerName: 'Alex Chen' },
	}),
	teamInvitationDeclined: define<TeamInvitationAnsweredProps>({
		category: 'teams',
		subject: teamInvitationDeclinedSubject,
		footerReason: 'You are receiving this because you captain this team.',
		component: TeamInvitationDeclined,
		sample: { teamName: 'Frost Giants', playerName: 'Alex Chen' },
	}),
	teamRequestAccepted: define<TeamRequestAnsweredProps>({
		category: 'teams',
		subject: teamRequestAcceptedSubject,
		footerReason: 'You are receiving this because you asked to join a team.',
		component: TeamRequestAccepted,
		sample: { teamName: 'Frost Giants', seasonName: 'Season 5' },
	}),
	teamRequestDeclined: define<TeamRequestAnsweredProps>({
		category: 'teams',
		subject: teamRequestDeclinedSubject,
		footerReason: 'You are receiving this because you asked to join a team.',
		component: TeamRequestDeclined,
		sample: { teamName: 'Frost Giants', seasonName: 'Season 5' },
	}),
	teamInvitationWithdrawn: define<TeamInvitationWithdrawnProps>({
		category: 'teams',
		subject: teamInvitationWithdrawnSubject,
		footerReason: 'You are receiving this because a captain invited you.',
		component: TeamInvitationWithdrawn,
		sample: { teamName: 'Frost Giants', seasonName: 'Season 5' },
	}),
	teamRequestWithdrawn: define<TeamRequestWithdrawnProps>({
		category: 'teams',
		subject: teamRequestWithdrawnSubject,
		footerReason: 'You are receiving this because you captain this team.',
		component: TeamRequestWithdrawn,
		sample: { teamName: 'Frost Giants', playerName: 'Alex Chen' },
	}),
	teamPlayerJoinedElsewhere: define<TeamPlayerJoinedElsewhereProps>({
		category: 'teams',
		subject: teamPlayerJoinedElsewhereSubject,
		footerReason: 'You are receiving this because you captain this team.',
		component: TeamPlayerJoinedElsewhere,
		sample: {
			teamName: 'Frost Giants',
			playerName: 'Alex Chen',
			joinedTeamName: 'Snow Owls',
			offerType: 'invitation',
		},
	}),
	teamRegistered: define<TeamRegisteredProps>({
		category: 'teams',
		subject: teamRegisteredSubject,
		footerReason: 'You are receiving this because you are on this team.',
		component: TeamRegistered,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			gameNights: 'November 7, 14 and 21, and December 5, 12 and 19',
		},
	}),
	teamMissedOut: define<TeamMissedOutProps>({
		category: 'teams',
		subject: teamMissedOutSubject,
		footerReason: 'You are receiving this because you were on this team.',
		component: TeamMissedOut,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			reason: 'season-full',
			refunding: true,
		},
	}),
	teamPaymentReceipt: define<TeamPaymentReceiptProps>({
		// A receipt is part of the payment, so it cannot be turned off.
		category: 'account',
		subject: teamPaymentReceiptSubject,
		footerReason:
			'You are receiving this receipt because you paid toward a team’s registration.',
		component: TeamPaymentReceipt,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			amount: '$250.00',
			paidOn: 'Thursday, October 1, 2026',
			paymentMethod: 'Visa •••• 4242',
			receiptUrl: 'https://pay.stripe.com/receipts/sample',
			teamRegistered: false,
			standing: {
				paid: '$750.00',
				fee: '$1,000.00',
				remaining: '$250.00',
				signedPlayers: 8,
				signedPlayersNeeded: 10,
			},
		},
	}),
	teamRefundReceipt: define<TeamRefundReceiptProps>({
		category: 'account',
		subject: teamRefundReceiptSubject,
		footerReason:
			'You are receiving this receipt because you paid toward a team’s registration.',
		component: TeamRefundReceipt,
		sample: {
			teamName: 'Frost Giants',
			seasonName: 'Season 5',
			cause: 'excess',
			teamRegistered: true,
			amount: '$250.00',
			refundedOn: 'Saturday, October 31, 2026',
			originallyPaid: '$250.00',
			fullRefund: true,
			receiptUrl: 'https://pay.stripe.com/receipts/sample',
			standing: {
				paid: '$500.00',
				fee: '$1,000.00',
				remaining: '$500.00',
				signedPlayers: 10,
				signedPlayersNeeded: 10,
			},
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
