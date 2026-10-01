/**
 * Badge queries. Badges are defined in code (`@/shared/badges`) and awarded
 * by the badges rebuild; Firestore holds only who earned what.
 */

import {
	query,
	collection,
	orderBy,
	type Query,
	type DocumentReference,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	BadgeStatsDocument,
	TeamBadgeDocument,
	TeamDocument,
	Collections,
	TEAM_BADGES_SUBCOLLECTION,
} from '@/types'

/** How many teams have earned each badge, one document per badge. */
export const badgeStatsQuery = (): Query<BadgeStatsDocument> =>
	collection(firestore, Collections.BADGES) as Query<BadgeStatsDocument>

/** Every badge a team has earned, one per badge and season, newest first. */
export const teamBadgesQuery = (
	teamRef: DocumentReference<TeamDocument> | undefined
): Query<TeamBadgeDocument> | undefined =>
	teamRef
		? (query(
				collection(teamRef, TEAM_BADGES_SUBCOLLECTION),
				orderBy('earnedAt', 'desc')
			) as Query<TeamBadgeDocument>)
		: undefined
