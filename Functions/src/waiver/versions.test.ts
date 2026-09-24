import { describe, expect, it } from 'vitest'
import {
	CURRENT_WAIVER_VERSION_ID,
	PARTICIPANT_PLACEHOLDER,
	WAIVER_VERSIONS,
	currentWaiverVersion,
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

	it('points current at a published version', () => {
		expect(currentWaiverVersion().id).toBe(CURRENT_WAIVER_VERSION_ID)
	})

	it('names the participant wherever a guardian signs for them', () => {
		const version = currentWaiverVersion()
		expect(version.guardianCertification.text).toContain(
			PARTICIPANT_PLACEHOLDER
		)
		expect(version.guardianAgreement).toContain(PARTICIPANT_PLACEHOLDER)
	})
})
