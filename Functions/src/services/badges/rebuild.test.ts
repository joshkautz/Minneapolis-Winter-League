import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase-functions/v2', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { retireBadges } = await import('./rebuild.js')

/**
 * Retiring a badge deletes its image before its document, so a run that
 * dies between the two leaves the document there to point the next run at
 * the image. The other order would orphan the image for good.
 */

const recorder = () => {
	const events: string[] = []
	const firestore = {
		batch: () => ({
			delete: (ref: { path: string }) => events.push(`delete ${ref.path}`),
			commit: async () => {
				events.push('commit')
			},
		}),
	}
	const bucket = (fail = false) => ({
		file: (path: string) => ({
			delete: async () => {
				if (fail) throw new Error('storage unavailable')
				events.push(`image ${path}`)
			},
		}),
	})
	return { events, firestore, bucket }
}

const retired = [
	{ ref: { path: 'badges/old-1' }, storagePath: 'badges/old-1.png' },
	{ ref: { path: 'badges/old-2' }, storagePath: null },
] as never

describe('retireBadges', () => {
	it('deletes the images, then the documents', async () => {
		const { events, firestore, bucket } = recorder()

		await retireBadges(firestore as never, bucket(), retired)

		expect(events).toEqual([
			'image badges/old-1.png',
			'delete badges/old-1',
			'delete badges/old-2',
			'commit',
		])
	})

	it('keeps the documents when an image cannot be deleted', async () => {
		const { events, firestore, bucket } = recorder()

		await expect(
			retireBadges(firestore as never, bucket(true), retired)
		).rejects.toThrow('storage unavailable')
		expect(events).toEqual([])
	})

	it('needs no bucket when no retired badge has an image', async () => {
		const { events, firestore } = recorder()

		await retireBadges(firestore as never, null, [
			{ ref: { path: 'badges/old-2' }, storagePath: null },
		] as never)

		expect(events).toEqual(['delete badges/old-2', 'commit'])
	})
})
