import { beforeAll, describe, expect, it } from 'vitest'
import { initTestApp } from './helpers.js'
import {
	deployedEndpointsFrom,
	localEndpointsFrom,
	triggerOf,
	unsafeChanges,
} from '../../scripts/ci/check-functions-deploy.js'

/**
 * The guard in front of CI's `firebase deploy --only functions --force`.
 *
 * `--force` is there so newly retried triggers can deploy, but it also
 * approves deleting any function missing from the source and changing a
 * function's trigger type. This check is what still stops those.
 */

const callable = { platform: 'gcfv2', trigger: 'callable' }
const written = {
	platform: 'gcfv2',
	trigger: 'event:google.cloud.firestore.document.v1.written',
}

describe('unsafeChanges', () => {
	it('passes when source and deployment match', () => {
		expect(
			unsafeChanges({ a: callable, b: written }, { a: callable, b: written })
		).toEqual({ deletions: [], triggerChanges: [] })
	})

	it('allows adding a function', () => {
		expect(unsafeChanges({ a: callable }, { a: callable, b: written })).toEqual(
			{ deletions: [], triggerChanges: [] }
		)
	})

	it('reports a deployed function missing from the source', () => {
		// The accidental case: an export dropped from index.ts.
		expect(unsafeChanges({ a: callable, b: written }, { a: callable })).toEqual(
			{ deletions: ['b'], triggerChanges: [] }
		)
	})

	it('reports a changed event type', () => {
		const updated = {
			platform: 'gcfv2',
			trigger: 'event:google.cloud.firestore.document.v1.updated',
		}
		expect(
			unsafeChanges({ b: written }, { b: updated }).triggerChanges
		).toEqual([
			{
				name: 'b',
				from: 'gcfv2 event:google.cloud.firestore.document.v1.written',
				to: 'gcfv2 event:google.cloud.firestore.document.v1.updated',
			},
		])
	})

	it('reports a change of trigger kind', () => {
		expect(
			unsafeChanges(
				{ a: callable },
				{ a: { platform: 'gcfv2', trigger: 'https' } }
			).triggerChanges
		).toHaveLength(1)
	})

	it('reports a move between v1 and v2', () => {
		expect(
			unsafeChanges(
				{ a: callable },
				{ a: { platform: 'gcfv1', trigger: 'callable' } }
			).triggerChanges
		).toHaveLength(1)
	})
})

describe('reading endpoints', () => {
	it('reads the functions:list shape', () => {
		expect(
			deployedEndpointsFrom({
				status: 'success',
				result: [
					{ id: 'a', platform: 'gcfv2', callableTrigger: {} },
					{
						id: 'b',
						platform: 'gcfv2',
						eventTrigger: {
							eventType: 'google.cloud.firestore.document.v1.written',
							retry: true,
						},
					},
				],
			})
		).toEqual({ a: callable, b: written })
	})

	it('ignores retry settings, which a forced deploy may change', () => {
		// Retry is the one thing --force is there to allow.
		const withRetry = {
			eventTrigger: { eventType: 'x', retry: true },
		}
		const without = {
			eventTrigger: { eventType: 'x', retry: false },
		}
		expect(triggerOf(withRetry)).toBe(triggerOf(without))
	})
})

describe('the real deploy manifest', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let manifest: Record<string, any>

	beforeAll(async () => {
		initTestApp()
		manifest = (await import('../../Functions/src/index.js')) as Record<
			string,
			unknown
		>
	})

	it('describes every function it exports', () => {
		const local = localEndpointsFrom(manifest)
		const exported = Object.keys(manifest).filter(
			(name) => manifest[name]?.__endpoint !== undefined
		)
		expect(Object.keys(local).sort()).toEqual(exported.sort())
	})

	it('recognises every trigger kind in use', () => {
		// An unrecognised kind compares equal to any other unrecognised one,
		// so a change between two of them would slip through.
		const unknown = Object.entries(localEndpointsFrom(manifest))
			.filter(([, endpoint]) => endpoint.trigger === 'unknown')
			.map(([name]) => name)
		expect(unknown).toEqual([])
	})
})
