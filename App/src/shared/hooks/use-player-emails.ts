import { useMemo } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { allPlayerContactsQuery } from '@/firebase/collections/players'
import { useQueryErrorHandler } from './use-query-error-handler'

/**
 * Every player's email, by player id, for the admin screens. Emails are not
 * on the public player documents; they are in `playerContacts`, which only
 * admins can list. Pass `enabled: false` until the viewer is known to be an
 * admin, or the query is refused.
 */
export const usePlayerEmails = (
	enabled: boolean,
	component: string
): { emails: Map<string, string>; loading: boolean } => {
	const [snapshot, loading, error] = useCollection(
		enabled ? allPlayerContactsQuery() : null
	)
	useQueryErrorHandler({ error, component, errorLabel: 'player emails' })

	const emails = useMemo(
		() =>
			new Map(snapshot?.docs.map((doc) => [doc.id, doc.data().email]) ?? []),
		[snapshot]
	)
	return { emails, loading }
}
