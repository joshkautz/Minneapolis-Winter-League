import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileToBase64 } from './file-encoding'

describe('fileToBase64', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('returns the contents as base64 without the data URL prefix', async () => {
		const file = new Blob(['hello'], { type: 'image/png' })
		await expect(fileToBase64(file)).resolves.toBe(btoa('hello'))
	})

	it('returns an empty string for an empty file', async () => {
		await expect(fileToBase64(new Blob([]))).resolves.toBe('')
	})

	it('rejects when the file cannot be read', async () => {
		const failure = new DOMException('Unreadable', 'NotReadableError')
		vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
			function (this: FileReader) {
				Object.defineProperty(this, 'error', { value: failure })
				this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
			}
		)
		await expect(fileToBase64(new Blob(['x']))).rejects.toBe(failure)
	})
})
