import { useEffect, useMemo } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { toast } from 'sonner'
import { waiverSignaturesQuery } from '@/firebase/collections/players'
import { logger, errorMessage } from '@/shared/utils'
import type { WaiverSignatureDocument } from '@/types'

export type WaiverSignature = WaiverSignatureDocument & { id: string }

/**
 * A player's waiver signatures, newest first.
 *
 * Only that player and admins can read them. The page uses them for two
 * things: showing this season's signature, and filling in the form from the
 * last one so a returning player does not retype their address and
 * emergency contacts.
 */
export const useWaiverSignatures = (playerId: string | undefined) => {
	const [snapshot, loading, error] = useCollection(
		waiverSignaturesQuery(playerId)
	)

	useEffect(() => {
		if (!error) return
		logger.error('Failed to load waiver signatures', error, {
			component: 'useWaiverSignatures',
		})
		toast.error('Could not load your waiver', {
			description: errorMessage(error, 'Please reload the page to try again.'),
		})
	}, [error])

	const signatures = useMemo(
		(): WaiverSignature[] =>
			(snapshot?.docs ?? [])
				.map((doc) => ({ ...doc.data(), id: doc.id }))
				.sort(
					(a, b) =>
						(b.signedAt?.toMillis() ?? 0) - (a.signedAt?.toMillis() ?? 0)
				),
		[snapshot]
	)

	return { signatures, loading, error }
}

/** The signature behind a season's `signed` flag, if there is one on record. */
export const signatureForSeason = (
	signatures: WaiverSignature[],
	seasonId: string | undefined
): WaiverSignature | undefined =>
	seasonId ? signatures.find((s) => s.seasonId === seasonId) : undefined

/**
 * The most recent details a player gave, to fill in this season's form.
 * An admin-recorded signature has none, so it is skipped.
 */
export const lastSignedDetails = (signatures: WaiverSignature[]) =>
	signatures.find((s) => s.method === 'player')
