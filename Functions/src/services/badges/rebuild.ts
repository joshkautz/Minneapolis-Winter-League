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
import { deleteInBatches, trackedBulkWriter } from '../../shared/batches.js'
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
async function planBadges(
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

/**
 * How long the award writes may take. Well inside the callable's and the
 * schedule's 540 seconds, so a stalled write fails with a message saying how
 * far it got instead of the request being killed without one: the first
 * production rebuild, on 1 October 2026, stalled on its last few deletes and
 * timed out silently.
 */
const BADGE_WRITES_DEADLINE_MS = 240_000

/**
 * Deletes the badge documents for badges no longer defined, and the images
 * that were uploaded for them. Images go first: if a run dies between the
 * two, the document is still there to point the next run at the image.
 * Done the other way, the image would be left with nothing referring to it.
 */
export async function retireBadges(
	firestore: Pick<Firestore, 'batch'>,
	bucket: {
		file(path: string): {
			delete(options: { ignoreNotFound: boolean }): Promise<unknown>
		}
	} | null,
	retire: BadgesPlan['retire']
): Promise<void> {
	const images = retire.flatMap(({ storagePath }) =>
		storagePath ? [storagePath] : []
	)
	if (images.length > 0) {
		if (!bucket) throw new Error('Retired badges have images but no bucket')
		await Promise.all(
			images.map((image) => bucket.file(image).delete({ ignoreNotFound: true }))
		)
	}
	await deleteInBatches(
		firestore,
		retire.map(({ ref }) => ref)
	)
}

/** Makes the stored awards match the rules, unless `dryRun`. */
export async function rebuildBadges(
	firestore: Firestore,
	{ now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {}
): Promise<BadgesSummary> {
	const started = Date.now()
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
	logger.info('Badges planned', {
		dryRun,
		ms: Date.now() - started,
		awards: summary.awards,
		created: summary.created,
		updated: summary.updated,
		removed: summary.removed,
		retiredBadges: summary.retiredBadges,
	})
	if (dryRun) return summary

	const writesStarted = Date.now()
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
	await writer.finish({ deadlineMs: BADGE_WRITES_DEADLINE_MS })
	logger.info('Badge awards written', { ms: Date.now() - writesStarted })

	if (plan.retire.length > 0) {
		const retireStarted = Date.now()
		const hasImages = plan.retire.some(({ storagePath }) => storagePath)
		await retireBadges(
			firestore,
			hasImages ? getStorage().bucket() : null,
			plan.retire
		)
		logger.info('Retired badges removed', {
			ms: Date.now() - retireStarted,
			count: plan.retire.length,
		})
	}

	logger.info('Badges rebuilt', { ...summary, ms: Date.now() - started })
	return summary
}
