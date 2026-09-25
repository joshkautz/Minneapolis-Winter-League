import { useEffect, useMemo } from 'react'

/**
 * A temporary URL for previewing a local file, revoked when the file changes
 * or the component unmounts. Creating one inline in render, as the image
 * forms used to, made a new URL on every render and never freed any.
 */
export const useObjectUrl = (file: Blob | undefined): string | undefined => {
	const url = useMemo(
		() => (file ? URL.createObjectURL(file) : undefined),
		[file]
	)
	useEffect(
		() => () => {
			if (url) URL.revokeObjectURL(url)
		},
		[url]
	)
	return url
}
