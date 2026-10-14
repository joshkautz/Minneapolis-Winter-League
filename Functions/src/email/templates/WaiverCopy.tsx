/**
 * The signer's copy of the waiver they just signed: the full text of the
 * version they agreed to, what they affirmed, and who signed when.
 *
 * The date of birth, address and emergency contacts stay out of it — they
 * are kept with the signature, on the site, rather than copied into an
 * inbox. A link opens the complete record, which can be printed.
 */

import type { ReactElement } from 'react'
import type { WaiverSignatureDocument } from '../../types.js'
import {
	fillParticipant,
	WAIVER_VERSIONS,
	type WaiverParagraph,
} from '../../waiver/versions.js'
import {
	EmailLayout,
	Facts,
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

export interface WaiverCopyProps {
	seasonName: string
	/** The version signed; its text is rendered from `waiver/versions.ts`. */
	versionId: string
	versionSha256: string
	participantName: string
	signerName: string
	signerRole: NonNullable<WaiverSignatureDocument['signerRole']>
	/** Set when a parent or guardian signed for a minor. */
	guardianRelationship: string | null
	/** e.g. "Thursday, October 15, 2026 at 7:42 PM CDT" */
	signedAt: string
	/** For the link to the complete record on the site. */
	playerId: string
	signatureId: string
}

const greeting = (name: string | null): string => (name ? `Hi ${name},` : 'Hi,')

/** One paragraph, with the original's bold opening and bold releases. */
const WaiverText = ({
	paragraph,
	participantName,
}: {
	paragraph: WaiverParagraph
	participantName: string
}): ReactElement => {
	const text = fillParticipant(paragraph.text, participantName)
	return (
		<Paragraph>
			{paragraph.lead && <strong>{paragraph.lead}</strong>}
			{paragraph.emphasized ? <strong>{text}</strong> : text}
		</Paragraph>
	)
}

export const waiverCopySubject = ({ seasonName }: WaiverCopyProps): string =>
	`Your signed waiver for ${seasonName}`

export const WaiverCopy = ({
	seasonName,
	versionId,
	versionSha256,
	participantName,
	signerName,
	signerRole,
	guardianRelationship,
	signedAt,
	playerId,
	signatureId,
	recipientFirstName,
	siteUrl,
	footer,
}: WaiverCopyProps & EmailContextProps): ReactElement => {
	const version = WAIVER_VERSIONS[versionId]
	const guardian = signerRole === 'guardian'
	return (
		<EmailLayout
			preview={`Your copy of the waiver ${guardian ? `you signed for ${participantName}` : 'you signed'} for ${seasonName}.`}
			siteUrl={siteUrl}
			footer={footer}
		>
			<Heading>Your signed waiver</Heading>
			<Paragraph>{greeting(recipientFirstName)}</Paragraph>
			<Paragraph>
				Thanks for signing the league’s waiver for {seasonName}
				{guardian ? ` on behalf of ${participantName}` : ''}. This email is your
				copy of what you agreed to. Keep it for your records.
			</Paragraph>
			<Facts
				rows={[
					['Participant', participantName],
					[
						guardian ? 'Signed by (parent or guardian)' : 'Signed by',
						guardian && guardianRelationship
							? `${signerName}, ${guardianRelationship}`
							: signerName,
					],
					['Signed', `${signedAt} (typed electronic signature)`],
					['Waiver version', `${versionId} (SHA-256 ${versionSha256})`],
				]}
			/>
			<PrimaryButton href={`${siteUrl}/waiver/copy/${playerId}/${signatureId}`}>
				View or print the full record
			</PrimaryButton>
			<Paragraph>
				The full record on the site also holds the date of birth, address and
				emergency contacts given when signing. Only you and the league’s admins
				can see it.
			</Paragraph>
			{version && (
				<>
					<Heading>{version.title}</Heading>
					{version.paragraphs.map((paragraph, index) => (
						<WaiverText
							key={index}
							paragraph={paragraph}
							participantName={participantName}
						/>
					))}
					{guardian ? (
						<>
							<Paragraph>{version.guardianIntro}</Paragraph>
							<WaiverText
								paragraph={version.guardianCertification}
								participantName={participantName}
							/>
							<Paragraph>
								{fillParticipant(version.guardianAgreement, participantName)}
							</Paragraph>
						</>
					) : (
						<>
							<Paragraph>
								<strong>{version.adultAffirmation}</strong>
							</Paragraph>
							<Paragraph>{version.agreement}</Paragraph>
						</>
					)}
					<Paragraph>{version.electronicSignatureConsent}</Paragraph>
				</>
			)}
		</EmailLayout>
	)
}
