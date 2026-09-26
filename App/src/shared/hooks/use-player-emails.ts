import { useMemo } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { allPlayerContactsQuery } from '@/firebase/collections/players'
import { useQueryErrorHandler } from './use-query-error-handler'

/**
 * Every player's email, by player id, for the admin screens. Emails are not
 * on the public player documents; they are in `playerContacts`, which only
 * admins can list — so use this only under `AdminRoute`, which renders its
 * page for admins alone.
 */
export const usePlayerEmails = (
	component: string
): { emails: Map<string, string>; loading: boolean } => {
	const [snapshot, loading, error] = useCollection(allPlayerContactsQuery())
	useQueryErrorHandler({ error, component, errorLabel: 'player emails' })

	const emails = useMemo(
		() =>
			new Map(snapshot?.docs.map((doc) => [doc.id, doc.data().email]) ?? []),
		[snapshot]
	)
	return { emails, loading }
}
