/**
 * Awards every badge: runs the rules over the league's data and makes the
 * stored awards match what they produce.
 *
 * Every award is a projection of the data, like the rankings, so a rebuild
 * creates the awards that are missing, rewrites any whose reason changed and
 * deletes any the rules no longer produce — a corrected score, or an award
 * from before badges were automatic. It then recounts each badge's teams for
 * the share the team page shows, and removes badge documents, and their
 * images, for badges no longer defined.
 *
 * Writes go through a BulkWriter: their number grows with the league.
 */

import {
	FieldValue,
	Timestamp,
	type DocumentReference,
	type Firestore,
} from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { BADGES, awardId } from '../../badges/catalog.js'
import { trackedBulkWriter } from '../../shared/batches.js'
import { teamBadgeRef } from '../../shared/database.js'
import {
	Collections,
	TEAM_BADGES_SUBCOLLECTION,
	type TeamBadgeDocument,
} from '../../types.js'
import { loadBadgeFacts } from './facts.js'
import { awardsFor, type Award } from './rules.js'

export interface BadgesSummary {
	/** Every award the rules produce. */
	awards: number
	created: number
	updated: number
	removed: number
	/** Badge documents removed because their badge is no longer defined. */
	retiredBadges: number
	/** Awards per badge id. */
	byBadge: Record<string, number>
}

export interface BadgesPlan {
	awards: Award[]
	create: Award[]
	update: Award[]
	/** Stored awards the rules no longer produce. */
	remove: DocumentReference[]
	/** `badges/{id}` documents for badges no longer defined. */
	retire: { ref: DocumentReference; storagePath: string | null }[]
}

const pathOf = (award: Award): string =>
	`${Collections.TEAMS}/${award.teamId}/${TEAM_BADGES_SUBCOLLECTION}/${awardId(award.badgeId, award.seasonId)}`

const unchanged = (stored: TeamBadgeDocument, award: Award): boolean =>
	stored.badgeId === award.badgeId &&
	stored.seasonId === award.seasonId &&
	stored.reason === award.reason &&
	stored.earnedAt?.toMillis?.() === award.earnedAt.getTime()

/** What a rebuild would write, without writing it. */
export async function planBadges(
	firestore: Firestore,
	now: Date
): Promise<BadgesPlan> {
	const [facts, stored, definitions] = await Promise.all([
		loadBadgeFacts(firestore, now),
		// The collection group also matches the top-level `badges`; only the
		// awards under a team are wanted here.
		firestore.collectionGroup(TEAM_BADGES_SUBCOLLECTION).get(),
		firestore.collection(Collections.BADGES).get(),
	])
	const awards = awardsFor(facts)
	const wanted = new Map(awards.map((award) => [pathOf(award), award]))

	const existing = new Map<string, TeamBadgeDocument>()
	const remove: DocumentReference[] = []
	for (const doc of stored.docs) {
		if (doc.ref.parent.parent?.parent.id !== Collections.TEAMS) continue
		if (wanted.has(doc.ref.path)) {
			existing.set(doc.ref.path, doc.data() as TeamBadgeDocument)
		} else {
			remove.push(doc.ref)
		}
	}

	const defined = new Set(BADGES.map((badge) => badge.id))
	return {
		awards,
		create: awards.filter((award) => !existing.has(pathOf(award))),
		update: awards.filter((award) => {
			const current = existing.get(pathOf(award))
			return current !== undefined && !unchanged(current, award)
		}),
		remove,
		retire: definitions.docs
			.filter((doc) => !defined.has(doc.id))
			.map((doc) => ({
				ref: doc.ref,
				storagePath:
					typeof doc.data().storagePath === 'string'
						? (doc.data().storagePath as string)
						: null,
			})),
	}
}

/** Makes the stored awards match the rules, unless `dryRun`. */
export async function rebuildBadges(
	firestore: Firestore,
	{ now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {}
): Promise<BadgesSummary> {
	const plan = await planBadges(firestore, now)
	const byBadge: Record<string, number> = {}
	for (const award of plan.awards) {
		byBadge[award.badgeId] = (byBadge[award.badgeId] ?? 0) + 1
	}
	const summary: BadgesSummary = {
		awards: plan.awards.length,
		created: plan.create.length,
		updated: plan.update.length,
		removed: plan.remove.length,
		retiredBadges: plan.retire.length,
		byBadge,
	}
	if (dryRun) return summary

	const writer = trackedBulkWriter(firestore, 'badge')
	const updatedAt = FieldValue.serverTimestamp()
	for (const award of [...plan.create, ...plan.update]) {
		writer.set(
			teamBadgeRef(firestore, award.teamId, award.badgeId, award.seasonId),
			{
				badgeId: award.badgeId,
				seasonId: award.seasonId,
				season: firestore.collection(Collections.SEASONS).doc(award.seasonId),
				earnedAt: Timestamp.fromDate(award.earnedAt),
				reason: award.reason,
				updatedAt,
			}
		)
	}
	for (const ref of plan.remove) writer.delete(ref)

	for (const badge of BADGES) {
		const earned = plan.awards.filter((award) => award.badgeId === badge.id)
		writer.set(firestore.collection(Collections.BADGES).doc(badge.id), {
			teamsEarned: new Set(earned.map((award) => award.teamId)).size,
			timesEarned: earned.length,
			updatedAt,
		})
	}
	for (const { ref } of plan.retire) writer.delete(ref)
	await writer.finish()

	// The images of badges that used to be uploaded by hand. Deleted after
	// the documents, so a failure here leaves a stray file, never a badge
	// pointing at a missing image.
	const images = plan.retire.flatMap(({ storagePath }) =>
		storagePath ? [storagePath] : []
	)
	if (images.length > 0) {
		const bucket = getStorage().bucket()
		await Promise.all(
			images.map((image) => bucket.file(image).delete({ ignoreNotFound: true }))
		)
	}

	logger.info('Badges rebuilt', summary)
	return summary
}
