import { beforeAll, describe, expect, it } from 'vitest'
import { initTestApp } from './helpers.js'

/**
 * Which triggers the platform retries.
 *
 * A Gen 2 event trigger that throws is **not** retried unless it sets
 * `retry: true`, and nothing in the code makes that obvious: a handler that
 * rethrows "so the trigger retries" does nothing of the kind without the
 * flag. Several did exactly that until this suite existed.
 *
 * Every event trigger in the deploy manifest has to appear in one list or
 * the other, so a new trigger cannot ship without someone deciding.
 */

/**
 * Retried for up to 24 hours. Each is idempotent: a retry after a partial
 * success does nothing the first attempt did not.
 */
const RETRIED = [
	// Registration recomputes: a lost one costs a team its spot mid-race.
	'updateTeamRegistrationOnContributionChange',
	'updateTeamRegistrationOnPlayerChange',
	'updateTeamRegistrationOnRosterChange',
	// A lost waiver request leaves a player unable to register, silently.
	'onRosterEntryCreated',
	// Runs after a player has been charged.
	'onPaymentCreated',
]

/** Not retried, each for a stated reason. */
const NOT_RETRIED: Record<string, string> = {
	onOfferUpdated:
		'throws on offers that can never succeed (already on a team, team not in the season); retrying would repeat the failure for a day',
	onTeamRegistrationChange:
		'catches its own errors; its deletions are not yet safe to repeat',
	userDeleted: 'a v1 Auth trigger, which this suite does not govern',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const eventTriggers = (): string[] =>
	Object.keys(manifest).filter(
		(name) => manifest[name]?.__endpoint?.eventTrigger !== undefined
	)

beforeAll(async () => {
	initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

describe('trigger retries', () => {
	it('classifies every event trigger in the deploy manifest', () => {
		const classified = new Set([...RETRIED, ...Object.keys(NOT_RETRIED)])
		expect(eventTriggers().filter((name) => !classified.has(name))).toEqual([])
	})

	it('lists only triggers that exist', () => {
		const exported = new Set(eventTriggers())
		expect(
			[...RETRIED, ...Object.keys(NOT_RETRIED)].filter(
				(name) => !exported.has(name)
			)
		).toEqual([])
	})

	it.each(RETRIED)('%s is retried by the platform', (name) => {
		expect(manifest[name].__endpoint.eventTrigger.retry).toBe(true)
	})

	it.each(Object.keys(NOT_RETRIED))('%s is not retried', (name) => {
		expect(manifest[name].__endpoint.eventTrigger.retry).not.toBe(true)
	})
})
