/**
 * The emails around joining a team: an invitation or a request arriving,
 * and its answer reaching whoever asked. Each links to the team page, where
 * invitations and requests are answered.
 */

import type { ReactElement, ReactNode } from 'react'
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

export interface TeamInvitationProps {
	teamName: string
	seasonName: string
	captainName: string
}

export interface TeamJoinRequestProps {
	teamName: string
	seasonName: string
	playerName: string
}

export interface TeamInvitationAnsweredProps {
	teamName: string
	playerName: string
}

export interface TeamRequestAnsweredProps {
	teamName: string
	seasonName: string
}

/** The layout every team email shares: greeting, message, one button. */
const TeamEmail = ({
	preview,
	heading,
	button,
	recipientFirstName,
	siteUrl,
	footer,
	children,
}: EmailContextProps & {
	preview: string
	heading: string
	button: string
	children: ReactNode
}): ReactElement => (
	<EmailLayout preview={preview} siteUrl={siteUrl} footer={footer}>
		<Heading>{heading}</Heading>
		<Paragraph>
			{recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,'}
		</Paragraph>
		{children}
		<PrimaryButton href={`${siteUrl}/manage`}>{button}</PrimaryButton>
	</EmailLayout>
)

/** A player accepted onto a team counts toward registration once signed. */
const WaiverReminder = (): ReactElement => (
	<Paragraph>
		A team counts only players who have signed this season&apos;s waiver, so if
		you haven&apos;t signed it yet, do it now from your team page.
	</Paragraph>
)

export const teamInvitationSubject = ({
	teamName,
	captainName,
}: TeamInvitationProps): string =>
	`${captainName} invited you to join ${teamName}`

export const TeamInvitation = ({
	teamName,
	seasonName,
	captainName,
	...context
}: TeamInvitationProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview='Accept or decline on your team page.'
		heading={`You're invited to ${teamName}`}
		button='See your invitation'
	>
		<Paragraph>
			{captainName} invited you to join {teamName} for {seasonName}. You can
			accept or decline on your team page. Accepting withdraws any other
			invitations and requests you have open this season.
		</Paragraph>
	</TeamEmail>
)

export const teamJoinRequestSubject = ({
	teamName,
	playerName,
}: TeamJoinRequestProps): string => `${playerName} asked to join ${teamName}`

export const TeamJoinRequest = ({
	teamName,
	seasonName,
	playerName,
	...context
}: TeamJoinRequestProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview='Accept or decline on your team page.'
		heading={`New request to join ${teamName}`}
		button='Review the request'
	>
		<Paragraph>
			{playerName} asked to join {teamName} for {seasonName}. As a captain, you
			can accept or decline on your team page.
		</Paragraph>
	</TeamEmail>
)

export const teamInvitationAcceptedSubject = ({
	teamName,
	playerName,
}: TeamInvitationAnsweredProps): string => `${playerName} joined ${teamName}`

export const TeamInvitationAccepted = ({
	teamName,
	playerName,
	...context
}: TeamInvitationAnsweredProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview={`${playerName} accepted your invitation.`}
		heading={`${playerName} is on the team`}
		button='See your roster'
	>
		<Paragraph>
			{playerName} accepted the invitation and is now on the {teamName} roster.
		</Paragraph>
	</TeamEmail>
)

export const teamInvitationDeclinedSubject = ({
	teamName,
	playerName,
}: TeamInvitationAnsweredProps): string =>
	`${playerName} declined the invitation to ${teamName}`

export const TeamInvitationDeclined = ({
	teamName,
	playerName,
	...context
}: TeamInvitationAnsweredProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview='You can invite other players from your team page.'
		heading='Invitation declined'
		button='Find players'
	>
		<Paragraph>
			{playerName} won&apos;t be joining {teamName}. You can invite other
			players from your team page.
		</Paragraph>
	</TeamEmail>
)

export const teamRequestAcceptedSubject = ({
	teamName,
}: TeamRequestAnsweredProps): string => `You're on ${teamName}`

export const TeamRequestAccepted = ({
	teamName,
	seasonName,
	...context
}: TeamRequestAnsweredProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview={`Your request to join ${teamName} was accepted.`}
		heading={`Welcome to ${teamName}`}
		button='See your team'
	>
		<Paragraph>
			Your request to join {teamName} for {seasonName} was accepted, and
			you&apos;re on the roster.
		</Paragraph>
		<WaiverReminder />
	</TeamEmail>
)

export const teamRequestDeclinedSubject = ({
	teamName,
}: TeamRequestAnsweredProps): string =>
	`Your request to join ${teamName} was declined`

export const TeamRequestDeclined = ({
	teamName,
	seasonName,
	...context
}: TeamRequestAnsweredProps & EmailContextProps): ReactElement => (
	<TeamEmail
		{...context}
		preview='You can ask another team, or start your own.'
		heading='Request declined'
		button='Find a team'
	>
		<Paragraph>
			{teamName} didn&apos;t accept your request to join for {seasonName}. You
			can ask another team, or start your own, from your team page.
		</Paragraph>
	</TeamEmail>
)
