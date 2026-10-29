import { describe, expect, it } from 'vitest'
import { renderEmail } from './render.js'
import { TEMPLATES } from './templates.js'
import {
	signedAtText,
	waiverCopyEmail,
	waiverCopyMailId,
} from './waiverCopy.js'
import { WAIVER_VERSIONS, fillParticipant } from '../waiver/versions.js'

const record = {
	versionId: '2026-09-original',
	versionSha256: 'abc123',
	participantName: 'Alex Chen',
	signerName: 'Alex Chen',
	signerRole: 'participant' as const,
	guardianRelationship: null,
}

const recipient = { recipientFirstName: 'Alex', unsubscribeUrl: null }

describe('waiverCopyEmail', () => {
	it('is keyed on the signature, so a signature has one copy', () => {
		expect(waiverCopyMailId('sig-1')).toBe('waiverCopy-sig-1')
		expect(
			waiverCopyEmail({
				playerId: 'player-1',
				signatureId: 'sig-1',
				seasonName: 'Season 5',
				record,
				signedAt: new Date('2026-10-16T00:42:00Z'),
			})
		).toEqual({
			id: 'waiverCopy-sig-1',
			to: { playerId: 'player-1' },
			template: 'waiverCopy',
			props: {
				seasonName: 'Season 5',
				...record,
				signedAt: 'Thursday, October 15, 2026 at 7:42 PM CDT',
				playerId: 'player-1',
				signatureId: 'sig-1',
			},
		})
	})

	it('reads the signing time on Minneapolis’s clock, in either season', () => {
		expect(signedAtText(new Date('2026-12-01T03:05:00Z'))).toBe(
			'Monday, November 30, 2026 at 9:05 PM CST'
		)
	})
})

describe('the waiver copy', () => {
	it('cannot be turned off: it is the signer’s record of an agreement', () => {
		expect(TEMPLATES.waiverCopy.category).toBe('account')
	})

	it('carries the whole text the participant agreed to', async () => {
		// The text of the version the signature records.
		const version = WAIVER_VERSIONS[record.versionId]
		const { text, subject } = await renderEmail(
			'waiverCopy',
			TEMPLATES.waiverCopy.sample,
			recipient
		)

		expect(subject).toBe('Your signed waiver for Season 5')
		const words = (value: string) => value.replace(/\s+/g, ' ')
		for (const paragraph of version.paragraphs) {
			expect(words(text)).toContain(
				words(fillParticipant(paragraph.text, 'Alex Chen')).trim()
			)
		}
		expect(words(text)).toContain(words(version.adultAffirmation))
		expect(words(text)).toContain(words(version.electronicSignatureConsent))
		expect(text).toContain('/waiver/copy/sample-player/sample-signature')
	})

	it('shows a guardian’s certification, not an adult’s affirmation', async () => {
		// The text of the version the signature records.
		const version = WAIVER_VERSIONS[record.versionId]
		const { text, html } = await renderEmail(
			'waiverCopy',
			{
				...TEMPLATES.waiverCopy.sample,
				participantName: 'Jamie Chen',
				signerName: 'Pat Chen',
				signerRole: 'guardian',
				guardianRelationship: 'Mother',
			},
			recipient
		)

		const words = (value: string) => value.replace(/\s+/g, ' ')
		expect(words(text)).toContain(
			words(fillParticipant(version.guardianAgreement, 'Jamie Chen'))
		)
		expect(words(text)).not.toContain(words(version.adultAffirmation))
		expect(html).toContain('Pat Chen, Mother')
		expect(text).toContain('on behalf of Jamie Chen')
	})
})
