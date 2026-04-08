/**
 * Returns a publicly-readable URL for a Cloud Storage file. Detects whether
 * the function is running against the local Firebase Storage emulator and
 * builds an emulator-pointing URL in that case; otherwise constructs the
 * standard public GCS URL (which assumes the file has been made public via
 * `file.makePublic()`).
 *
 * The emulator's `file.publicUrl()` returns a `firebasestorage.googleapis.com`
 * URL that points at production GCS — which 404s for files that only exist
 * locally. This helper papers over that mismatch so the App can render
 * newly-uploaded logos against the local emulator.
 */
export const getPublicFileUrl = (
	bucketName: string,
	filePath: string
): string => {
	const encodedPath = encodeURIComponent(filePath)
	const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
	if (emulatorHost) {
		return `http://${emulatorHost}/v0/b/${bucketName}/o/${encodedPath}?alt=media`
	}
	// Standard public GCS URL — equivalent to `file.publicUrl()` for files
	// that have had `makePublic()` called on them.
	return `https://storage.googleapis.com/${bucketName}/${encodedPath}`
}
