import { useParams, Link } from 'react-router-dom'
import { useDocument } from 'react-firebase-hooks/firestore'
import { AlertCircle, ArrowLeft, Printer } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { waiverSignatureRef } from '@/firebase/collections/players'
import { LoadingSpinner } from '@/shared/components'
import { formatTimestampWithTime } from '@/shared/utils'
import { WAIVER_VERSIONS, fillParticipant } from '@/shared/waiver'
import type { WaiverSignatureDocument } from '@/types'
import { WaiverDocument, WaiverParagraphText } from './waiver-document'

/**
 * `/waiver/copy/:playerId/:signatureId` — a signed waiver, laid out to print
 * or save as a PDF from the browser.
 *
 * This is the signer's copy, which the electronic-signature laws expect them
 * to be able to keep, and the league's evidence of who agreed to which text.
 * Only the player and admins can open it; Firestore rules enforce that.
 */
export const WaiverCopy = () => {
	const { playerId, signatureId } = useParams()
	const [snapshot, loading, error] = useDocument(
		waiverSignatureRef(playerId, signatureId)
	)

	if (loading) return <LoadingSpinner size='lg' centered />

	const signature = snapshot?.data()
	if (error || !signature) {
		return (
			<div className='container max-w-3xl py-8'>
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' aria-hidden='true' />
					<AlertDescription>
						{error
							? 'You do not have access to this waiver.'
							: 'This waiver could not be found.'}
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	const version = WAIVER_VERSIONS[signature.versionId]

	return (
		<div className='container max-w-3xl space-y-6 py-8 print:max-w-none print:py-0'>
			<div className='flex flex-wrap items-center justify-between gap-2 print:hidden'>
				<Button asChild variant='ghost' size='sm'>
					<Link to='/waiver'>
						<ArrowLeft className='h-4 w-4' aria-hidden='true' />
						Back
					</Link>
				</Button>
				<Button onClick={() => window.print()}>
					<Printer className='h-4 w-4' aria-hidden='true' />
					Print or save as PDF
				</Button>
			</div>

			{version ? (
				<WaiverDocument
					version={version}
					participantName={signature.participantName}
				/>
			) : (
				<Alert>
					<AlertDescription>
						The text of version {signature.versionId} is not in this build of
						the site.
					</AlertDescription>
				</Alert>
			)}

			<SignatureDetails signature={signature} />
		</div>
	)
}

const Row = ({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) => (
	<div className='grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm'>
		<dt className='text-muted-foreground'>{label}</dt>
		<dd className='break-words'>{children}</dd>
	</div>
)

const SignatureDetails = ({
	signature,
}: {
	signature: WaiverSignatureDocument
}) => {
	const version = WAIVER_VERSIONS[signature.versionId]
	const guardian = signature.signerRole === 'guardian'

	return (
		<section
			aria-labelledby='signature-heading'
			className='space-y-4 border-t pt-6 break-inside-avoid'
		>
			<h2 id='signature-heading' className='text-base font-semibold'>
				Signature
			</h2>

			{version &&
				(guardian ? (
					<div className='space-y-2 text-sm'>
						<p>{version.guardianIntro}</p>
						<WaiverParagraphText
							paragraph={version.guardianCertification}
							participantName={signature.participantName}
						/>
						<p>
							{fillParticipant(
								version.guardianAgreement,
								signature.participantName
							)}
						</p>
					</div>
				) : signature.method === 'player' ? (
					<div className='space-y-2 text-sm'>
						<p className='font-semibold'>{version.adultAffirmation}</p>
						<p>{version.agreement}</p>
					</div>
				) : null)}

			<dl className='divide-y'>
				<Row label='Participant'>{signature.participantName}</Row>
				{signature.dateOfBirth && (
					<Row label='Date of birth'>{signature.dateOfBirth}</Row>
				)}
				{signature.mailingAddress && (
					<Row label='Address'>{signature.mailingAddress}</Row>
				)}
				{signature.emergencyContacts.map((contact, index) => (
					<Row key={index} label={`Emergency contact ${index + 1}`}>
						{contact.name} ({contact.relationship}), {contact.phone}
					</Row>
				))}
				{signature.method === 'player' ? (
					<>
						<Row label={guardian ? 'Signed by (guardian)' : 'Signed by'}>
							<span className='font-medium'>{signature.signerName}</span>
							{guardian &&
								signature.guardianRelationship &&
								` — ${signature.guardianRelationship}`}
						</Row>
						<Row label='Signed'>
							{formatTimestampWithTime(signature.signedAt)} (typed electronic
							signature)
						</Row>
						{signature.email && (
							<Row label='Account email'>{signature.email}</Row>
						)}
						{signature.ipAddress && (
							<Row label='IP address'>{signature.ipAddress}</Row>
						)}
					</>
				) : (
					<Row label='Recorded'>
						{formatTimestampWithTime(signature.signedAt)} by an admin.{' '}
						{signature.note}
					</Row>
				)}
				<Row label='Waiver version'>
					{signature.versionId}{' '}
					<span className='font-mono text-xs text-muted-foreground'>
						(SHA-256 {signature.versionSha256.slice(0, 16)}…)
					</span>
				</Row>
			</dl>
		</section>
	)
}
