import { useCollection } from 'react-firebase-hooks/firestore'
import { teamRosterSubcollection } from '@/firebase/collections/teams'

/** How many players are on a team's roster for a season, once loaded. */
export const useRosterSize = (
	teamId: string | undefined,
	seasonId: string | undefined
): number | undefined => {
	const [rosterSnapshot] = useCollection(
		teamId && seasonId ? teamRosterSubcollection(teamId, seasonId) : null
	)
	return rosterSnapshot?.size
}
