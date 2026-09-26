/**
 * Receiving and storing an uploaded image: a team logo or a badge image.
 *
 * The App sends the file as base64 with its content type. These check it
 * against `imageRules.ts`, the same rules the App applies before sending,
 * and save it publicly to Storage.
 */

import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { imageProblem } from './imageRules.js'
import { getPublicFileUrl } from './storage.js'

export interface ImageUpload {
	bytes: Buffer
	contentType: string
}

export interface StoredImage {
	url: string
	storagePath: string
}

/**
 * The image in a request, or null if there is none. Throws
 * `invalid-argument` with a message fit to show the uploader when it is
 * half-specified, not an accepted type, empty or too large.
 */
export function parseImageUpload(
	base64: unknown,
	contentType: unknown,
	subject: string
): ImageUpload | null {
	const absent = (value: unknown): boolean =>
		value === undefined || value === null || value === ''
	if (absent(base64) && absent(contentType)) return null
	if (
		typeof base64 !== 'string' ||
		typeof contentType !== 'string' ||
		absent(base64) ||
		absent(contentType)
	) {
		throw new HttpsError(
			'invalid-argument',
			`${subject} did not arrive complete. Choose it again and retry.`
		)
	}

	const bytes = Buffer.from(base64, 'base64')
	const problem = imageProblem(
		{ sizeBytes: bytes.length, contentType },
		subject
	)
	if (problem) throw new HttpsError('invalid-argument', problem)
	return { bytes, contentType }
}

/**
 * Saves an image at `storagePath` and makes it public. Throws `internal`
 * with a message saying nothing was changed if Storage refuses it, so a
 * caller that stores before writing Firestore leaves no half-made record.
 */
export async function storeImage(
	storagePath: string,
	image: ImageUpload,
	subject: string
): Promise<StoredImage> {
	try {
		const bucket = getStorage().bucket()
		const file = bucket.file(storagePath)
		await file.save(image.bytes, {
			metadata: { contentType: image.contentType },
		})
		await file.makePublic()
		return { url: getPublicFileUrl(bucket.name, storagePath), storagePath }
	} catch (error) {
		logger.error('Image upload failed', {
			storagePath,
			contentType: image.contentType,
			sizeBytes: image.bytes.length,
			error: error instanceof Error ? error.message : String(error),
		})
		throw new HttpsError(
			'internal',
			`${subject} could not be saved, so nothing was changed. Please try again.`
		)
	}
}

/**
 * Deletes a stored image that nothing points to any more. Best effort: a
 * file left behind costs little, so a failure is logged, not thrown.
 */
export async function deleteStoredImage(storagePath: string): Promise<void> {
	try {
		await getStorage().bucket().file(storagePath).delete()
	} catch (error) {
		logger.warn('Could not delete a replaced image', {
			storagePath,
			error: error instanceof Error ? error.message : String(error),
		})
	}
}
