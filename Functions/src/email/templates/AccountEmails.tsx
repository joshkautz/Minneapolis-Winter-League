/**
 * The two emails that look after a sign-in: confirming an address and
 * resetting a password. Firebase used to send its own plain versions; these
 * come from the league, like everything else, and link to the league's own
 * page (`/auth/action`) rather than Firebase's.
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

/** A one-time link on the league's site, carrying Firebase's action code. */
export interface AccountLinkProps {
	link: string
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

export const emailVerificationSubject = (): string =>
	'Verify your email for the Minneapolis Winter League'

export const EmailVerification = ({
	link,
	recipientFirstName,
	siteUrl,
	footer,
}: AccountLinkProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview='Confirm your email to finish setting up your account.'
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>Confirm your email</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			Confirm this is your email address to finish setting up your Minneapolis
			Winter League account. You need a confirmed email to join a team, sign the
			waiver and pay.
		</Paragraph>
		<PrimaryButton href={link}>Confirm my email</PrimaryButton>
		<Paragraph>
			If you didn&apos;t create an account, you can ignore this email.
		</Paragraph>
	</EmailLayout>
)

export const passwordResetSubject = (): string =>
	'Reset your Minneapolis Winter League password'

export const PasswordReset = ({
	link,
	recipientFirstName,
	siteUrl,
	footer,
}: AccountLinkProps & EmailContextProps): ReactElement => (
	<EmailLayout
		preview='Choose a new password for your account.'
		siteUrl={siteUrl}
		footer={footer}
	>
		<Heading>Reset your password</Heading>
		<Paragraph>{greeting(recipientFirstName)}</Paragraph>
		<Paragraph>
			Someone asked to reset the password for your Minneapolis Winter League
			account. Choose a new one with the button below. The link works once, and
			only for the next hour.
		</Paragraph>
		<PrimaryButton href={link}>Choose a new password</PrimaryButton>
		<Paragraph>
			If you didn&apos;t ask for this, you can ignore this email: your password
			stays as it is.
		</Paragraph>
	</EmailLayout>
)
