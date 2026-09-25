import { describe, expect, it, vi } from 'vitest'

const { getStorage } = vi.hoisted(() => ({ getStorage: vi.fn() }))
vi.mock('firebase-admin/storage', () => ({ getStorage }))
vi.mock('firebase-functions/v2', () => ({
	logger: { error: vi.fn(), warn: vi.fn() },
}))

const { parseImageUpload, storeImage } = await import('./images.js')

const base64Of = (bytes: number): string =>
	Buffer.alloc(bytes, 1).toString('base64')

describe('parseImageUpload', () => {
	it('is null when the request has no image', () => {
		expect(parseImageUpload(undefined, undefined, 'The logo')).toBeNull()
		expect(parseImageUpload(null, '', 'The logo')).toBeNull()
	})

	it('returns the decoded bytes of an accepted image', () => {
		const upload = parseImageUpload(base64Of(300), 'image/png', 'The logo')
		expect(upload?.bytes.length).toBe(300)
		expect(upload?.contentType).toBe('image/png')
	})

	it('refuses half an image with a clear message', () => {
		expect(() => parseImageUpload(base64Of(10), undefined, 'The logo')).toThrow(
			'The logo did not arrive complete. Choose it again and retry.'
		)
		expect(() => parseImageUpload(undefined, 'image/png', 'The logo')).toThrow(
			'did not arrive complete'
		)
	})

	it('measures the decoded size, not the base64 length', () => {
		// Base64 is a third larger than the file, so a 4.5 MB image arrives
		// as 6 MB of text and must still be accepted.
		const nearLimit = Math.floor(4.5 * 1024 * 1024)
		expect(
			parseImageUpload(base64Of(nearLimit), 'image/jpeg', 'The logo')
		).not.toBeNull()
		expect(() =>
			parseImageUpload(base64Of(6 * 1024 * 1024), 'image/jpeg', 'The logo')
		).toThrow('The logo is 6.0 MB')
	})

	it('refuses with invalid-argument', () => {
		expect(() =>
			parseImageUpload(base64Of(10), 'image/svg+xml', 'The logo')
		).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
	})
})

describe('storeImage', () => {
	const image = { bytes: Buffer.from('logo'), contentType: 'image/png' }

	it('saves the image publicly and returns where it is', async () => {
		const save = vi.fn().mockResolvedValue(undefined)
		const makePublic = vi.fn().mockResolvedValue(undefined)
		getStorage.mockReturnValue({
			bucket: () => ({ name: 'b', file: () => ({ save, makePublic }) }),
		})

		const stored = await storeImage('teams/x', image, 'The logo')

		expect(save).toHaveBeenCalledWith(image.bytes, {
			metadata: { contentType: 'image/png' },
		})
		expect(makePublic).toHaveBeenCalled()
		expect(stored.storagePath).toBe('teams/x')
		expect(stored.url).toContain('teams%2Fx')
	})

	it('turns a Storage failure into a message saying nothing changed', async () => {
		getStorage.mockReturnValue({
			bucket: () => ({
				name: 'b',
				file: () => ({
					save: vi.fn().mockRejectedValue(new Error('403 Forbidden')),
				}),
			}),
		})

		await expect(storeImage('teams/x', image, 'The logo')).rejects.toThrow(
			expect.objectContaining({
				code: 'internal',
				message:
					'The logo could not be saved, so nothing was changed. Please try again.',
			})
		)
	})
})
