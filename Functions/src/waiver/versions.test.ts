import { describe, expect, it } from 'vitest'
import {
	LATEST_WAIVER_VERSION_ID,
	PARTICIPANT_PLACEHOLDER,
	WAIVER_VERSIONS,
	fillParticipant,
	waiverVersionForSeason,
} from './versions.js'
import { waiverFingerprint } from './fingerprint.js'

/**
 * A signature records a version id and that version's fingerprint. It is
 * evidence of what a player agreed to only while the text behind the id is
 * unchanged, so each published version's hash is pinned here. If this fails
 * because the wording was edited, revert the edit and add a new version
 * instead — then pin that one too.
 */
const PUBLISHED: Record<string, string> = {
	'2026-09-original':
		'ca517f1cc18b6b19111a250b60e4814ad89b968b92c1c07bfb45b6470b47da23',
	'2026-10-grey-duck-alumni':
		'6c5fc15dbeef93a0171444148ce74ade7bbd43b5a48def95cb4023fc12774bb1',
}

describe('waiver versions', () => {
	it.each(Object.entries(PUBLISHED))(
		'%s has not changed since it was published',
		(id, sha256) => {
			expect(WAIVER_VERSIONS[id]).toBeDefined()
			expect(waiverFingerprint(WAIVER_VERSIONS[id])).toBe(sha256)
		}
	)

	it('pins every version, so none can change unnoticed', () => {
		expect(Object.keys(WAIVER_VERSIONS).sort()).toEqual(
			Object.keys(PUBLISHED).sort()
		)
	})

	it('files each version under its own id', () => {
		for (const [key, version] of Object.entries(WAIVER_VERSIONS)) {
			expect(version.id).toBe(key)
		}
	})

	it('points latest at a published version', () => {
		expect(WAIVER_VERSIONS[LATEST_WAIVER_VERSION_ID]).toBeDefined()
	})

	it.each(Object.keys(PUBLISHED))(
		'%s names the participant wherever a guardian signs for them',
		(id) => {
			const version = WAIVER_VERSIONS[id]
			expect(version.guardianCertification.text).toContain(
				PARTICIPANT_PLACEHOLDER
			)
			expect(version.guardianAgreement).toContain(PARTICIPANT_PLACEHOLDER)
		}
	)

	it('fills every blank with the participant’s name', () => {
		expect(
			fillParticipant(
				`I, ${PARTICIPANT_PLACEHOLDER}, and ${PARTICIPANT_PLACEHOLDER}.`,
				'Alex Chen'
			)
		).toBe('I, Alex Chen, and Alex Chen.')
	})
})

describe('the version a season is signed on', () => {
	it('is the one recorded on the season', () => {
		expect(
			waiverVersionForSeason({ waiverVersionId: '2026-10-grey-duck-alumni' })
				?.id
		).toBe('2026-10-grey-duck-alumni')
	})

	it('is the original for a season that records none, as Season 5 does', () => {
		expect(waiverVersionForSeason({})?.id).toBe('2026-09-original')
		expect(waiverVersionForSeason(undefined)?.id).toBe('2026-09-original')
	})

	it('is nothing for a version this build does not have', () => {
		expect(waiverVersionForSeason({ waiverVersionId: 'later' })).toBeUndefined()
	})
})

describe('the Grey Duck Alumni version', () => {
	const text = JSON.stringify(WAIVER_VERSIONS['2026-10-grey-duck-alumni'])

	it('is the one new seasons are signed on', () => {
		expect(LATEST_WAIVER_VERSION_ID).toBe('2026-10-grey-duck-alumni')
	})

	it('releases Grey Duck Alumni at its address, and never Minneapolis Mallard', () => {
		expect(text).toContain(
			'GREY DUCK ALUMNI, located at 4316 Glencrest Road, Golden Valley, Minnesota 55416'
		)
		expect(text).not.toMatch(/mallard|washburn/i)
	})

	it('changes nothing else in the original’s wording', () => {
		const original = JSON.stringify(WAIVER_VERSIONS['2026-09-original'])
			.replace(
				'MINNEAPOLIS MALLARD, located at 4534 Washburn Ave N, Minneapolis, Minnesota 55412',
				'GREY DUCK ALUMNI, located at 4316 Glencrest Road, Golden Valley, Minnesota 55416'
			)
			.replaceAll('MINNEAPOLIS MALLARD', 'GREY DUCK ALUMNI')
			.replace('2026-09-original', '2026-10-grey-duck-alumni')
		expect(text).toBe(original)
	})
})
