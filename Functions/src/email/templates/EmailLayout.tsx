/**
 * The frame every league email shares: the site's wordmark, one white card
 * on the site's slate background, and a footer saying why the email came.
 */

import type { ReactElement, ReactNode } from 'react'
import {
	Body,
	Button,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from '@react-email/components'
import { COLORS, FONT_STACK, LOGO, RADIUS } from './theme.js'

export interface EmailFooter {
	/** One sentence: why this person received this email. */
	reason: string
	/** The preferences page, for email a player can turn off. */
	unsubscribeUrl: string | null
	/** Required by CAN-SPAM in announcements. */
	postalAddress: string | null
}

interface EmailLayoutProps {
	/** The line inboxes show beside the subject. */
	preview: string
	siteUrl: string
	footer: EmailFooter
	children: ReactNode
}

export const EmailLayout = ({
	preview,
	siteUrl,
	footer,
	children,
}: EmailLayoutProps): ReactElement => (
	<Html lang='en'>
		<Head />
		<Preview>{preview}</Preview>
		<Body style={body}>
			<Container style={container}>
				<Section style={header}>
					<Link href={siteUrl}>
						<Img
							src={LOGO.src}
							width={LOGO.width}
							height={LOGO.height}
							alt='Minneapolis Winter League'
							style={logo}
						/>
					</Link>
				</Section>
				<Section style={card}>{children}</Section>
				<Section style={footerSection}>
					<Text style={footerText}>{footer.reason}</Text>
					{footer.unsubscribeUrl && (
						// Yahoo and CAN-SPAM want a clearly visible way out in the
						// body. It opens the preferences page, one click from done.
						<Text style={footerText}>
							Don&apos;t want these emails?{' '}
							<Link href={footer.unsubscribeUrl} style={footerLink}>
								Unsubscribe
							</Link>
						</Text>
					)}
					<Text style={footerText}>
						Minneapolis Winter League ·{' '}
						<Link href={siteUrl} style={footerLink}>
							mplswinterleague.com
						</Link>
						{footer.postalAddress && <> · {footer.postalAddress}</>}
					</Text>
				</Section>
			</Container>
		</Body>
	</Html>
)

/** A heading in the league's navy. */
export const Heading = ({
	children,
}: {
	children: ReactNode
}): ReactElement => <Text style={heading}>{children}</Text>

/** Body copy. */
export const Paragraph = ({
	children,
}: {
	children: ReactNode
}): ReactElement => <Text style={paragraph}>{children}</Text>

/** The main action, styled as the site's primary button. */
export const PrimaryButton = ({
	href,
	children,
}: {
	href: string
	children: ReactNode
}): ReactElement => (
	<Section style={buttonRow}>
		<Button href={href} style={button}>
			{children}
		</Button>
	</Section>
)

/** A highlighted box, in a wash of the league's light blue. */
export const Callout = ({
	title,
	children,
}: {
	title: string
	children: ReactNode
}): ReactElement => (
	<Section style={callout}>
		<Text style={calloutTitle}>{title}</Text>
		<Text style={calloutText}>{children}</Text>
	</Section>
)

/** Label-and-value rows, for dates and facts. */
export const Facts = ({
	rows,
}: {
	rows: [label: string, value: string][]
}): ReactElement => (
	<Section style={facts}>
		{rows.map(([label, value]) => (
			<Text key={label} style={factRow}>
				<span style={factLabel}>{label}</span>
				<br />
				{value}
			</Text>
		))}
	</Section>
)

export const Divider = (): ReactElement => <Hr style={divider} />

// ---- Styles ---------------------------------------------------------------

const body = {
	backgroundColor: COLORS.background,
	fontFamily: FONT_STACK,
	margin: 0,
	padding: '24px 0',
}

const container = {
	maxWidth: '600px',
	margin: '0 auto',
	padding: '0 16px',
}

const header = { padding: '8px 0 24px', textAlign: 'center' as const }

const logo = { margin: '0 auto', display: 'block' }

const card = {
	backgroundColor: COLORS.card,
	border: `1px solid ${COLORS.border}`,
	borderTop: `4px solid ${COLORS.sky}`,
	borderRadius: RADIUS,
	padding: '32px',
}

const heading = {
	color: COLORS.navy,
	fontSize: '24px',
	fontWeight: 700,
	lineHeight: '1.3',
	margin: '0 0 16px',
}

const paragraph = {
	color: COLORS.navy,
	fontSize: '16px',
	lineHeight: '1.6',
	margin: '0 0 16px',
}

const buttonRow = { padding: '8px 0 16px' }

const button = {
	backgroundColor: COLORS.navy,
	borderRadius: RADIUS,
	color: COLORS.onNavy,
	fontSize: '16px',
	fontWeight: 600,
	padding: '12px 24px',
	textDecoration: 'none',
}

const callout = {
	backgroundColor: COLORS.skyWash,
	borderLeft: `4px solid ${COLORS.sky}`,
	borderRadius: RADIUS,
	margin: '8px 0 24px',
	padding: '16px 20px',
}

const calloutTitle = {
	color: COLORS.navy,
	fontSize: '16px',
	fontWeight: 700,
	margin: '0 0 4px',
}

const calloutText = {
	color: COLORS.navy,
	fontSize: '15px',
	lineHeight: '1.6',
	margin: 0,
}

const facts = { margin: '0 0 16px' }

const factRow = {
	color: COLORS.navy,
	fontSize: '15px',
	lineHeight: '1.5',
	margin: '0 0 12px',
}

const factLabel = {
	color: COLORS.muted,
	fontSize: '13px',
	fontWeight: 600,
	letterSpacing: '0.04em',
	textTransform: 'uppercase' as const,
}

const divider = { borderColor: COLORS.border, margin: '24px 0' }

const footerSection = { padding: '24px 8px 0', textAlign: 'center' as const }

const footerText = {
	color: COLORS.muted,
	fontSize: '13px',
	lineHeight: '1.5',
	margin: '0 0 8px',
}

const footerLink = { color: COLORS.muted, textDecoration: 'underline' }
