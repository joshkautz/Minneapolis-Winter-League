import { useEffect } from 'react'
import type { DocumentReference } from 'firebase/firestore'
import { useDocumentOnce } from 'react-firebase-hooks/firestore'
import type { PlayerDocument } from '@/types'
import { logger } from '@/shared/utils'

/** Shown while the author's player document loads. */
export const AUTHOR_LOADING = 'Loading...'
/** Shown when the author's player document could not be read. */
export const AUTHOR_UNKNOWN = 'Unknown'

/**
 * The name of whoever wrote a post, reply or news item, read once.
 *
 * `missingName` is shown when the author's player document no longer exists
 * — they deleted their account — which each feed words differently.
 */
export const useAuthorName = (
	author: DocumentReference<PlayerDocument>,
	missingName: string
): string => {
	const [snapshot, loading, error] = useDocumentOnce(author)

	useEffect(() => {
		if (error) {
			logger.error('Error fetching author', error, { path: author.path })
		}
	}, [error, author.path])

	if (error) return AUTHOR_UNKNOWN
	if (loading || !snapshot) return AUTHOR_LOADING
	const player = snapshot.data()
	return player ? `${player.firstname} ${player.lastname}` : missingName
}
