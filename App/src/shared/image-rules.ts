/**
 * What an uploaded image may be: the same rules the server applies, imported
 * from `Functions/src/shared/imageRules.ts` rather than copied, so a form
 * refuses an image in the words the server would have used. That file has no
 * imports, which is what makes loading it from the other workspace safe.
 */

export {
	ALLOWED_IMAGE_TYPES,
	ALLOWED_IMAGE_TYPES_LABEL,
	MAX_IMAGE_BYTES,
	formatMegabytes,
	imageProblem,
} from '../../../Functions/src/shared/imageRules'
