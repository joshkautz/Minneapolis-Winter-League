/**
 * What an uploaded image may be: team logos and badge images alike.
 *
 * The App imports this file (`App/src/shared/image-rules.ts`) so that a
 * form refuses an image with the same words the server would, before it is
 * uploaded. Keep it free of imports, as the waiver's rules are: it is loaded
 * from the other workspace.
 */

/** The largest image accepted: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * The image types accepted. SVG is left out on purpose: it can carry
 * script, and these files are served publicly.
 */
export const ALLOWED_IMAGE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
] as const

/** The accepted types, as a person would name them. */
export const ALLOWED_IMAGE_TYPES_LABEL = 'PNG, JPEG, GIF or WebP'

const BYTES_PER_MEGABYTE = 1024 * 1024

/** A size in megabytes to one decimal place, for messages ("7.3 MB"). */
export const formatMegabytes = (bytes: number): string =>
	`${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`

/**
 * Why an image cannot be used, or null if it can. `subject` names it for
 * the message, capitalised: "The logo", "The badge image".
 */
export const imageProblem = (
	image: { sizeBytes: number; contentType: string },
	subject: string
): string | null => {
	if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(image.contentType)) {
		return `${subject} must be a ${ALLOWED_IMAGE_TYPES_LABEL} image.`
	}
	if (image.sizeBytes === 0) {
		return `${subject} is an empty file. Choose another image.`
	}
	if (image.sizeBytes > MAX_IMAGE_BYTES) {
		return (
			`${subject} is ${formatMegabytes(image.sizeBytes)}, and the limit is ` +
			`${formatMegabytes(MAX_IMAGE_BYTES)}. Choose a smaller image, or ` +
			'resize this one and try again.'
		)
	}
	return null
}
