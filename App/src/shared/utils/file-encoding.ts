/**
 * A file's contents as bare base64, without the `data:<type>;base64,` prefix
 * a data URL carries. This is the form the team and badge callables take an
 * uploaded image in; they write it to Storage themselves.
 */
export const fileToBase64 = (file: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const dataUrl = reader.result as string
			resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
		}
		reader.onerror = () =>
			reject(reader.error ?? new Error('Could not read the file'))
		reader.readAsDataURL(file)
	})
