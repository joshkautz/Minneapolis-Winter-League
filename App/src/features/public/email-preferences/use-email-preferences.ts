import { useCallback, useEffect, useRef, useState } from 'react'
import {
	getEmailPreferencesViaFunction,
	updateEmailPreferencesViaFunction,
	type EmailPreferenceLink,
	type EmailPreferences,
} from '@/firebase/collections/functions'
import { errorMessage, logger } from '@/shared/utils'

export type EmailPreferencesState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; email: string; preferences: EmailPreferences }

/**
 * A player's email preferences, and a way to change them.
 *
 * @param link from an email's link; `null` for the signed-in player
 */
export const useEmailPreferences = (link: EmailPreferenceLink | null) => {
	const [state, setState] = useState<EmailPreferencesState>({
		status: 'loading',
	})
	const [saving, setSaving] = useState(false)
	const savingRef = useRef(false)
	const playerId = link?.playerId
	const token = link?.token

	useEffect(() => {
		let cancelled = false
		getEmailPreferencesViaFunction(
			playerId !== undefined ? { playerId, token } : {}
		)
			.then(({ email, preferences }) => {
				if (!cancelled) setState({ status: 'ready', email, preferences })
			})
			.catch((error: unknown) => {
				logger.error('Failed to load email preferences', error)
				if (!cancelled) {
					setState({
						status: 'error',
						message: errorMessage(
							error,
							'Your email preferences could not be loaded. Please try again.'
						),
					})
				}
			})
		return () => {
			cancelled = true
		}
	}, [playerId, token])

	/** Saves `changes`: true when saved, or a sentence saying why not. */
	const update = useCallback(
		async (changes: Partial<EmailPreferences>): Promise<true | string> => {
			if (savingRef.current) return 'Still saving your last change.'
			savingRef.current = true
			setSaving(true)
			try {
				const { email, preferences } = await updateEmailPreferencesViaFunction(
					playerId !== undefined ? { playerId, token } : {},
					changes
				)
				setState({ status: 'ready', email, preferences })
				return true
			} catch (error) {
				logger.error('Failed to update email preferences', error)
				return errorMessage(
					error,
					'Your email preferences could not be saved. Please try again.'
				)
			} finally {
				savingRef.current = false
				setSaving(false)
			}
		},
		[playerId, token]
	)

	return { state, saving, update }
}
