import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BADGES } from '../../Functions/src/badges/catalog.js'
import { ART, TIERS } from '../../scripts/badge-art/badges.js'

/**
 * Every badge the rules award has artwork drawn for it and a published image
 * the site can show: a badge added to the catalog without either would
 * appear on the team page as a broken image.
 */

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..'
)

describe('badge artwork', () => {
	it('describes exactly the badges in the catalog', () => {
		expect(ART.map((art) => art.id).sort()).toEqual(
			BADGES.map((badge) => badge.id).sort()
		)
	})

	it('has a rim for every tier', () => {
		for (const badge of BADGES) expect(TIERS[badge.tier]).toBeDefined()
	})

	it.each(BADGES.map((badge) => badge.id))('publishes %s.webp', (id) => {
		expect(
			existsSync(path.join(repoRoot, 'App/public/badges', `${id}.webp`))
		).toBe(true)
	})
})
