#!/usr/bin/env node
/**
 * 2026 Teams + Players data model migration.
 *
 * Transforms the flat `teams` collection (one doc per team-season instance,
 * linked via a `teamId` field) into a canonical-team + season-subcollection
 * shape, and simultaneously converts `players/{uid}.seasons[]` arrays into
 * a `players/{uid}/playerSeasons/{seasonId}` subcollection. Captain, paid,
 * signed, and banned status all live uniformly on the player's season subdoc;
 * the team roster becomes a pure membership join.
 *
 * Note: The subcollections were previously named `seasons` on both the team
 * and player sides, which made `collectionGroup('seasons')` queries match
 * both. They were renamed to `teamSeasons` and `playerSeasons` before the
 * production cutover to disambiguate collection-group queries.
 *
 * Target shape:
 *
 *   teams/{teamId}                                 ← canonical anchor
 *     createdAt, createdBy
 *     /teamSeasons/{seasonId}
 *       season, name, logo, storagePath,
 *       registered, registeredDate, placement
 *       /roster/{playerId}
 *         player, dateJoined
 *     /badges/{badgeId}
 *       badge, awardedAt, awardedBy, seasonId
 *
 *   players/{uid}
 *     admin, email, firstname, lastname, createdAt
 *     /playerSeasons/{seasonId}
 *       season, team, paid, signed, banned, captain
 *
 * Modes:
 *   --mode=plan          Read-only analysis of the source data. Writes a
 *                        JSON report and no Firestore state. Always safe.
 *   --mode=migrate       Stages the new shape into parallel collections
 *                        (teams_new, teams_new_idmap, players_new_seasons).
 *                        Leaves `teams` and `players` untouched. Idempotent.
 *                        Dry-run unless --commit is passed.
 *   --mode=validate      Verifies the staged new shape is internally
 *                        consistent and covers every source record.
 *   --mode=cutover       Destructive. Deletes `teams` + each player's seasons
 *                        array, copies staging into the canonical locations,
 *                        rewrites game/offer team refs. Idempotent against
 *                        partial runs. Requires --commit.
 *   --mode=rollback      Deletes the staging collections (only meaningful
 *                        before cutover).
 *
 * Prerequisites:
 *   - gcloud auth application-default login
 *
 * Usage:
 *   node scripts/migrations/2026-teams-v2/run.js --mode=plan
 *   node scripts/migrations/2026-teams-v2/run.js --mode=migrate --commit
 *   node scripts/migrations/2026-teams-v2/run.js --mode=validate
 *   node scripts/migrations/2026-teams-v2/run.js --mode=cutover --commit
 */

import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---- CLI -------------------------------------------------------------------

const args = process.argv.slice(2)
const modeArg = args.find((a) => a.startsWith('--mode='))
const MODE = modeArg ? modeArg.slice('--mode='.length) : null
const COMMIT = args.includes('--commit')
const PROJECT_ID =
	args.find((a) => a.startsWith('--project='))?.slice('--project='.length) ??
	'minnesota-winter-league'

const VALID_MODES = ['plan', 'migrate', 'validate', 'cutover', 'rollback']
if (!MODE || !VALID_MODES.includes(MODE)) {
	console.error(`Usage: --mode=${VALID_MODES.join('|')} [--commit]`)
	process.exit(2)
}

// ---- Firebase --------------------------------------------------------------

const app = admin.initializeApp({ projectId: PROJECT_ID })
const db = app.firestore()
const FieldValue = admin.firestore.FieldValue
const Timestamp = admin.firestore.Timestamp

// ---- Constants -------------------------------------------------------------

const STAGING = {
	teams: 'teams_new',
	idmap: 'teams_new_idmap',
	playerSeasons: 'players_new_seasons',
}

const BATCH_LIMIT = 400 // leave headroom under Firestore's 500

// ---- Utilities -------------------------------------------------------------

function logHeader(title) {
	console.log('\n' + '━'.repeat(60))
	console.log(`  ${title}`)
	console.log('━'.repeat(60))
}

function timestampToIso(ts) {
	if (!ts) return null
	if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
	if (ts._seconds !== undefined)
		return new Date(
			ts._seconds * 1000 + (ts._nanoseconds ?? 0) / 1e6
		).toISOString()
	return null
}

function refPath(ref) {
	return ref && ref.path ? ref.path : null
}

function refEqual(a, b) {
	if (!a || !b) return false
	return a.path === b.path
}

async function batchCommit(writes) {
	for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
		const batch = db.batch()
		const chunk = writes.slice(i, i + BATCH_LIMIT)
		for (const w of chunk) w(batch)
		await batch.commit()
	}
}

// ---- Phase A: plan ---------------------------------------------------------

/**
 * Loads every team, player, season, game, and offer document and produces a
 * dry-run report of the migration's shape. Never writes anything.
 */
async function runPlan() {
	logHeader('Phase A — plan (read-only)')

	const [teamsSnap, playersSnap, seasonsSnap, gamesSnap, offersSnap] =
		await Promise.all([
			db.collection('teams').get(),
			db.collection('players').get(),
			db.collection('seasons').get(),
			db.collection('games').get(),
			db.collection('offers').get(),
		])

	console.log(`Loaded:`)
	console.log(`  teams:    ${teamsSnap.size}`)
	console.log(`  players:  ${playersSnap.size}`)
	console.log(`  seasons:  ${seasonsSnap.size}`)
	console.log(`  games:    ${gamesSnap.size}`)
	console.log(`  offers:   ${offersSnap.size}`)

	// Build season→dateStart map for canonical-name tie-breaking.
	const seasonsById = new Map()
	for (const doc of seasonsSnap.docs) {
		const data = doc.data()
		seasonsById.set(doc.id, {
			id: doc.id,
			name: data.name ?? null,
			dateStart: data.dateStart ?? null,
			dateStartMs: data.dateStart?.toMillis?.() ?? 0,
		})
	}

	// ---- Group teams by `teamId` field -------------------------------------
	const groupsByTeamId = new Map()
	const orphanedTeamInstances = []
	const duplicateSeasonsInGroup = []

	for (const doc of teamsSnap.docs) {
		const data = doc.data()
		const teamId = data.teamId
		if (!teamId) {
			orphanedTeamInstances.push({ docId: doc.id, name: data.name })
			continue
		}
		if (!groupsByTeamId.has(teamId)) groupsByTeamId.set(teamId, [])
		groupsByTeamId.get(teamId).push({ docId: doc.id, data })
	}

	// Sanity: no two instances within a group should share the same season.id.
	for (const [teamId, instances] of groupsByTeamId) {
		const seen = new Map()
		for (const inst of instances) {
			const seasonId = inst.data.season?.id ?? null
			if (seasonId && seen.has(seasonId)) {
				duplicateSeasonsInGroup.push({
					teamId,
					seasonId,
					docIds: [seen.get(seasonId), inst.docId],
				})
			} else if (seasonId) {
				seen.set(seasonId, inst.docId)
			}
		}
	}

	// Per-group canonical selection and roster/badge accounting.
	const canonicalTeams = []
	let totalRosterEntries = 0
	let totalBadgesRaw = 0
	let totalBadgesAfterDedup = 0
	const badgeDedupDetails = []

	for (const [teamId, instances] of groupsByTeamId) {
		// Sort instances by season start date ascending for determinism.
		instances.sort((a, b) => {
			const aMs = seasonsById.get(a.data.season?.id)?.dateStartMs ?? 0
			const bMs = seasonsById.get(b.data.season?.id)?.dateStartMs ?? 0
			return aMs - bMs
		})

		const earliest = instances[0]
		const createdAtGuess =
			earliest.data.registeredDate ??
			(earliest.data.season
				? (seasonsById.get(earliest.data.season.id)?.dateStart ?? null)
				: null)

		// Find createdBy: first captain in earliest instance's roster, if any.
		let createdByRef = null
		if (Array.isArray(earliest.data.roster)) {
			const firstCaptain =
				earliest.data.roster.find((r) => r && r.captain) ??
				earliest.data.roster[0]
			createdByRef = firstCaptain?.player ?? null
		}

		// Walk badges subcollection per instance and dedup by badgeId.
		const badgesByBadgeId = new Map()
		for (const inst of instances) {
			const badgesSnap = await db
				.collection('teams')
				.doc(inst.docId)
				.collection('badges')
				.get()
			for (const bDoc of badgesSnap.docs) {
				totalBadgesRaw++
				const bData = bDoc.data()
				const existing = badgesByBadgeId.get(bDoc.id)
				if (!existing) {
					badgesByBadgeId.set(bDoc.id, {
						doc: bData,
						fromInstanceDocId: inst.docId,
						seasonId: inst.data.season?.id ?? null,
					})
				} else {
					// Prefer the earlier awardedAt.
					const existingAt = existing.doc.awardedAt?.toMillis?.() ?? Infinity
					const newAt = bData.awardedAt?.toMillis?.() ?? Infinity
					if (newAt < existingAt) {
						badgesByBadgeId.set(bDoc.id, {
							doc: bData,
							fromInstanceDocId: inst.docId,
							seasonId: inst.data.season?.id ?? null,
						})
					}
					badgeDedupDetails.push({
						teamId,
						badgeId: bDoc.id,
						keptFrom: badgesByBadgeId.get(bDoc.id).fromInstanceDocId,
					})
				}
			}
		}
		totalBadgesAfterDedup += badgesByBadgeId.size

		// Count roster entries across all instances.
		for (const inst of instances) {
			totalRosterEntries += Array.isArray(inst.data.roster)
				? inst.data.roster.length
				: 0
		}

		canonicalTeams.push({
			teamId,
			instanceDocIds: instances.map((i) => i.docId),
			seasonIds: instances.map((i) => i.data.season?.id ?? null),
			createdAtIso: timestampToIso(createdAtGuess),
			createdByRefPath: refPath(createdByRef),
			badgeCount: badgesByBadgeId.size,
		})
	}

	// ---- Player-side analysis ----------------------------------------------
	const legacyDocIdToTeamId = new Map()
	for (const [teamId, instances] of groupsByTeamId) {
		for (const inst of instances) legacyDocIdToTeamId.set(inst.docId, teamId)
	}

	let playerSeasonEntryCount = 0
	let playerSeasonEntriesWithTeam = 0
	let playerSeasonEntriesWithDanglingTeam = 0
	let captainEntries = 0
	const playerRefRewritesPreview = []

	for (const pDoc of playersSnap.docs) {
		const pData = pDoc.data()
		const seasons = Array.isArray(pData.seasons) ? pData.seasons : []
		for (const entry of seasons) {
			playerSeasonEntryCount++
			if (entry?.team?.id) {
				playerSeasonEntriesWithTeam++
				const canonicalTeamId = legacyDocIdToTeamId.get(entry.team.id)
				if (!canonicalTeamId) {
					playerSeasonEntriesWithDanglingTeam++
				} else if (playerRefRewritesPreview.length < 5) {
					playerRefRewritesPreview.push({
						playerId: pDoc.id,
						seasonId: entry.season?.id ?? null,
						legacyTeamDocId: entry.team.id,
						canonicalTeamId,
					})
				}
			}
			if (entry?.captain) captainEntries++
		}
	}

	// ---- Games/offers team-ref analysis ------------------------------------
	let gameHomeRefsNeedingRewrite = 0
	let gameAwayRefsNeedingRewrite = 0
	let gameRefsDangling = 0
	for (const gDoc of gamesSnap.docs) {
		const g = gDoc.data()
		if (g.home?.id) {
			if (legacyDocIdToTeamId.has(g.home.id)) gameHomeRefsNeedingRewrite++
			else gameRefsDangling++
		}
		if (g.away?.id) {
			if (legacyDocIdToTeamId.has(g.away.id)) gameAwayRefsNeedingRewrite++
			else gameRefsDangling++
		}
	}

	let offerTeamRefsNeedingRewrite = 0
	let offerRefsDangling = 0
	for (const oDoc of offersSnap.docs) {
		const o = oDoc.data()
		if (o.team?.id) {
			if (legacyDocIdToTeamId.has(o.team.id)) offerTeamRefsNeedingRewrite++
			else offerRefsDangling++
		}
	}

	// ---- Summary -----------------------------------------------------------
	const report = {
		generatedAt: new Date().toISOString(),
		projectId: PROJECT_ID,
		sourceCounts: {
			teams: teamsSnap.size,
			players: playersSnap.size,
			seasons: seasonsSnap.size,
			games: gamesSnap.size,
			offers: offersSnap.size,
		},
		teams: {
			canonicalTeamCount: canonicalTeams.length,
			seasonParticipations: teamsSnap.size - orphanedTeamInstances.length,
			orphanedInstanceCount: orphanedTeamInstances.length,
			orphanedInstances: orphanedTeamInstances,
			duplicateSeasonsInGroup,
			totalRosterEntries,
			badges: {
				rawCount: totalBadgesRaw,
				afterDedup: totalBadgesAfterDedup,
				dedupedCount: totalBadgesRaw - totalBadgesAfterDedup,
				samples: badgeDedupDetails.slice(0, 10),
			},
		},
		players: {
			playerCount: playersSnap.size,
			totalPlayerSeasonEntries: playerSeasonEntryCount,
			entriesWithTeamRef: playerSeasonEntriesWithTeam,
			entriesWithDanglingTeamRef: playerSeasonEntriesWithDanglingTeam,
			captainEntries,
			sampleRefRewrites: playerRefRewritesPreview,
		},
		games: {
			total: gamesSnap.size,
			homeRefsToRewrite: gameHomeRefsNeedingRewrite,
			awayRefsToRewrite: gameAwayRefsNeedingRewrite,
			danglingRefs: gameRefsDangling,
		},
		offers: {
			total: offersSnap.size,
			teamRefsToRewrite: offerTeamRefsNeedingRewrite,
			danglingRefs: offerRefsDangling,
		},
	}

	console.log('\nSummary:')
	console.log(
		`  canonical teams:          ${report.teams.canonicalTeamCount} (from ${report.teams.seasonParticipations} season participations)`
	)
	console.log(
		`  orphaned instances:       ${report.teams.orphanedInstanceCount}`
	)
	console.log(
		`  duplicate seasons:        ${report.teams.duplicateSeasonsInGroup.length}`
	)
	console.log(`  roster entries total:     ${report.teams.totalRosterEntries}`)
	console.log(
		`  badges:                   ${report.teams.badges.rawCount} raw → ${report.teams.badges.afterDedup} after dedup (${report.teams.badges.dedupedCount} duplicates removed)`
	)
	console.log(
		`  player season entries:    ${report.players.totalPlayerSeasonEntries}`
	)
	console.log(
		`  entries with team ref:    ${report.players.entriesWithTeamRef}`
	)
	console.log(
		`  dangling team refs:       ${report.players.entriesWithDanglingTeamRef}`
	)
	console.log(
		`  captain entries:          ${report.players.captainEntries}`
	)
	console.log(
		`  game refs to rewrite:     ${report.games.homeRefsToRewrite} home + ${report.games.awayRefsToRewrite} away (dangling: ${report.games.danglingRefs})`
	)
	console.log(
		`  offer refs to rewrite:    ${report.offers.teamRefsToRewrite} (dangling: ${report.offers.danglingRefs})`
	)

	const reportDir = path.join(__dirname, 'reports')
	if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const reportPath = path.join(reportDir, `plan-${stamp}.json`)
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
	console.log(`\nWrote detailed report to ${reportPath}`)

	// Hard errors surfaced at the summary level.
	const errors = []
	if (report.teams.orphanedInstanceCount > 0)
		errors.push(
			`${report.teams.orphanedInstanceCount} team instances have no teamId field`
		)
	if (report.teams.duplicateSeasonsInGroup.length > 0)
		errors.push(
			`${report.teams.duplicateSeasonsInGroup.length} duplicate-season collisions within canonical groups`
		)
	if (report.players.entriesWithDanglingTeamRef > 0)
		errors.push(
			`${report.players.entriesWithDanglingTeamRef} player season entries reference a nonexistent team doc`
		)
	if (report.games.danglingRefs > 0)
		errors.push(
			`${report.games.danglingRefs} game team refs point at nonexistent team docs`
		)
	if (report.offers.danglingRefs > 0)
		errors.push(
			`${report.offers.danglingRefs} offer team refs point at nonexistent team docs`
		)

	if (errors.length > 0) {
		console.log('\n⚠️  Data-quality warnings to resolve before migrate:')
		for (const e of errors) console.log(`  - ${e}`)
	} else {
		console.log('\n✅ No data-quality issues detected.')
	}
}

// ---- Phase B: migrate ------------------------------------------------------

/**
 * Builds an in-memory model of the migration target by reading every team,
 * player, season, game, and offer document. Returns the structures the
 * migrate / cutover phases need.
 *
 * No writes. Pure analysis. Shared between migrate, validate, and cutover.
 */
async function buildMigrationPlan() {
	const [teamsSnap, playersSnap, seasonsSnap, gamesSnap, offersSnap] =
		await Promise.all([
			db.collection('teams').get(),
			db.collection('players').get(),
			db.collection('seasons').get(),
			db.collection('games').get(),
			db.collection('offers').get(),
		])

	// season metadata for canonical tie-break / createdAt fallback
	const seasonsById = new Map()
	for (const doc of seasonsSnap.docs) {
		const data = doc.data()
		seasonsById.set(doc.id, {
			id: doc.id,
			name: data.name ?? null,
			dateStart: data.dateStart ?? null,
			dateStartMs: data.dateStart?.toMillis?.() ?? 0,
		})
	}

	// group team instances by canonical teamId
	const groupsByTeamId = new Map()
	for (const doc of teamsSnap.docs) {
		const data = doc.data()
		const teamId = data.teamId
		if (!teamId) continue
		if (!groupsByTeamId.has(teamId)) groupsByTeamId.set(teamId, [])
		groupsByTeamId.get(teamId).push({ docId: doc.id, data })
	}

	// legacy doc id → canonical teamId
	const legacyDocIdToCanonical = new Map()
	for (const [teamId, instances] of groupsByTeamId) {
		for (const inst of instances) legacyDocIdToCanonical.set(inst.docId, teamId)
	}

	return {
		teamsSnap,
		playersSnap,
		seasonsSnap,
		gamesSnap,
		offersSnap,
		seasonsById,
		groupsByTeamId,
		legacyDocIdToCanonical,
	}
}

/**
 * Stages the migration. Writes to teams_new / teams_new_idmap /
 * players_new_seasons. Leaves teams / players / games / offers entirely
 * untouched. Idempotent.
 */
async function runMigrate() {
	logHeader('Phase B — migrate (stage to teams_new + players_new_seasons)')

	if (!COMMIT) {
		console.log(
			'⚠️  Dry run — no Firestore writes will be performed. Pass --commit to apply.'
		)
	}

	const plan = await buildMigrationPlan()
	const { groupsByTeamId, seasonsById, playersSnap, legacyDocIdToCanonical } =
		plan

	const stats = {
		canonicalTeams: 0,
		teamSeasons: 0,
		rosterDocs: 0,
		badgeDocs: 0,
		idmapDocs: 0,
		playerSeasons: 0,
	}

	const teamsNewCol = db.collection(STAGING.teams)
	const idmapCol = db.collection(STAGING.idmap)
	const playersNewSeasonsCol = db.collection(STAGING.playerSeasons)

	const writes = []

	// ---- teams_new + subcollections ---------------------------------------
	for (const [teamId, instances] of groupsByTeamId) {
		// Sort by season start ascending for deterministic createdAt selection.
		instances.sort((a, b) => {
			const aMs = seasonsById.get(a.data.season?.id)?.dateStartMs ?? 0
			const bMs = seasonsById.get(b.data.season?.id)?.dateStartMs ?? 0
			return aMs - bMs
		})

		const earliest = instances[0]
		const createdAt =
			earliest.data.registeredDate ??
			seasonsById.get(earliest.data.season?.id)?.dateStart ??
			Timestamp.now()

		// createdBy: first captain on earliest instance, else first roster member, else null.
		let createdByRef = null
		if (Array.isArray(earliest.data.roster) && earliest.data.roster.length > 0) {
			const firstCaptain =
				earliest.data.roster.find((r) => r && r.captain) ??
				earliest.data.roster[0]
			createdByRef = firstCaptain?.player ?? null
		}

		const canonicalDocRef = teamsNewCol.doc(teamId)
		writes.push((batch) =>
			batch.set(canonicalDocRef, {
				createdAt,
				createdBy: createdByRef,
			})
		)
		stats.canonicalTeams++

		// Write the season subdoc + roster subcollection per instance.
		for (const inst of instances) {
			const seasonId = inst.data.season?.id
			if (!seasonId) {
				console.warn(
					`  ⚠️  Skipping instance ${inst.docId} of canonical team ${teamId}: no season ref`
				)
				continue
			}
			const seasonDocRef = canonicalDocRef
				.collection('teamSeasons')
				.doc(seasonId)

			writes.push((batch) =>
				batch.set(seasonDocRef, {
					season: inst.data.season,
					name: inst.data.name ?? null,
					logo: inst.data.logo ?? null,
					storagePath: inst.data.storagePath ?? null,
					registered: inst.data.registered ?? false,
					registeredDate: inst.data.registeredDate ?? null,
					placement: inst.data.placement ?? null,
				})
			)
			stats.teamSeasons++

			// Roster subcollection: one doc per roster array entry, no captain field.
			const roster = Array.isArray(inst.data.roster) ? inst.data.roster : []
			for (const entry of roster) {
				const playerId = entry?.player?.id
				if (!playerId) continue
				const rosterDocRef = seasonDocRef.collection('roster').doc(playerId)
				writes.push((batch) =>
					batch.set(rosterDocRef, {
						player: entry.player,
						dateJoined: entry.dateJoined ?? null,
					})
				)
				stats.rosterDocs++
			}

			// idmap entry: legacy doc id → canonical team id (per season instance,
			// since multiple legacy ids share the same canonical id only for
			// different seasons).
			writes.push((batch) =>
				batch.set(idmapCol.doc(inst.docId), {
					canonicalTeamId: teamId,
					seasonId,
				})
			)
			stats.idmapDocs++
		}

		// Badges subcollection: dedup by badgeId across all instances of this team.
		const badgesByBadgeId = new Map()
		for (const inst of instances) {
			const badgesSnap = await db
				.collection('teams')
				.doc(inst.docId)
				.collection('badges')
				.get()
			for (const bDoc of badgesSnap.docs) {
				const bData = bDoc.data()
				const seasonIdForBadge = inst.data.season?.id ?? null
				const existing = badgesByBadgeId.get(bDoc.id)
				if (!existing) {
					badgesByBadgeId.set(bDoc.id, {
						doc: bData,
						seasonId: seasonIdForBadge,
					})
				} else {
					const existingAt = existing.doc.awardedAt?.toMillis?.() ?? Infinity
					const newAt = bData.awardedAt?.toMillis?.() ?? Infinity
					if (newAt < existingAt) {
						badgesByBadgeId.set(bDoc.id, {
							doc: bData,
							seasonId: seasonIdForBadge,
						})
					}
				}
			}
		}

		for (const [badgeId, { doc, seasonId }] of badgesByBadgeId) {
			const badgeDocRef = canonicalDocRef.collection('badges').doc(badgeId)
			writes.push((batch) =>
				batch.set(badgeDocRef, {
					badge: doc.badge ?? null,
					awardedAt: doc.awardedAt ?? null,
					awardedBy: doc.awardedBy ?? null,
					seasonId,
				})
			)
			stats.badgeDocs++
		}
	}

	// ---- players_new_seasons (staging area) -------------------------------
	// One doc per (player, season) pair. Doc id is `${uid}__${seasonId}`. The
	// cutover phase will read these and rewrite them into the canonical
	// players/{uid}/playerSeasons/{seasonId} subcollection.
	//
	// Captain status is derived from the team's roster entry, NOT from the
	// player's seasons array. Real production data contains a small number of
	// players whose `captain` field on the player document is a DocumentReference
	// (not a boolean) due to a historical write bug. The team-side roster
	// entry is consistently boolean and is therefore the source of truth.
	const captainsByPlayerSeason = new Map() // `${playerId}__${seasonId}` → boolean
	for (const [teamId, instances] of groupsByTeamId) {
		for (const inst of instances) {
			const seasonId = inst.data.season?.id
			if (!seasonId) continue
			const roster = Array.isArray(inst.data.roster) ? inst.data.roster : []
			for (const entry of roster) {
				const playerId = entry?.player?.id
				if (!playerId) continue
				captainsByPlayerSeason.set(
					`${playerId}__${seasonId}`,
					entry.captain === true
				)
			}
		}
	}

	const safeBool = (v) => v === true

	for (const pDoc of playersSnap.docs) {
		const pData = pDoc.data()
		const seasons = Array.isArray(pData.seasons) ? pData.seasons : []
		for (const entry of seasons) {
			const seasonId = entry?.season?.id
			if (!seasonId) continue
			let teamRef = null
			if (entry?.team?.id) {
				const canonicalTeamId = legacyDocIdToCanonical.get(entry.team.id)
				if (canonicalTeamId) {
					teamRef = db.collection(STAGING.teams).doc(canonicalTeamId)
				}
			}
			const captainKey = `${pDoc.id}__${seasonId}`
			const captain =
				captainsByPlayerSeason.get(captainKey) ?? false /* default if not on a team */
			const stageDocRef = playersNewSeasonsCol.doc(captainKey)
			writes.push((batch) =>
				batch.set(stageDocRef, {
					playerId: pDoc.id,
					seasonId,
					season: entry.season,
					team: teamRef,
					paid: safeBool(entry?.paid),
					signed: safeBool(entry?.signed),
					banned: safeBool(entry?.banned),
					captain,
				})
			)
			stats.playerSeasons++
		}
	}

	console.log(`\nPlanned writes:`)
	console.log(`  teams_new docs (canonical):            ${stats.canonicalTeams}`)
	console.log(`  teams_new/.../seasons subdocs:         ${stats.teamSeasons}`)
	console.log(
		`  teams_new/.../teamSeasons/.../roster docs: ${stats.rosterDocs}`
	)
	console.log(`  teams_new/.../badges docs:             ${stats.badgeDocs}`)
	console.log(`  teams_new_idmap docs:                  ${stats.idmapDocs}`)
	console.log(`  players_new_seasons staged docs:       ${stats.playerSeasons}`)
	console.log(`  TOTAL writes:                          ${writes.length}`)

	if (!COMMIT) {
		console.log(
			'\n💡 Re-run with --commit to apply these writes to the staging collections.'
		)
		return
	}

	console.log(`\nApplying ${writes.length} writes in batches of ${BATCH_LIMIT}…`)
	await batchCommit(writes)
	console.log('✅ migrate complete.')
}

// ---- Phase C: validate -----------------------------------------------------

/**
 * Verifies the staged data is internally consistent and covers every source
 * record. Read-only. Run after migrate (must have been run with --commit).
 */
async function runValidate() {
	logHeader('Phase C — validate staged collections')

	const plan = await buildMigrationPlan()
	const { groupsByTeamId, playersSnap, legacyDocIdToCanonical } = plan

	const errors = []
	const warnings = []

	// 1. Every group has a canonical doc.
	for (const teamId of groupsByTeamId.keys()) {
		const docSnap = await db.collection(STAGING.teams).doc(teamId).get()
		if (!docSnap.exists) {
			errors.push(`teams_new/${teamId} is missing`)
			continue
		}
		const data = docSnap.data()
		if (!data.createdAt) errors.push(`teams_new/${teamId} missing createdAt`)
	}

	// 2. Every legacy season instance has a corresponding subdoc + idmap.
	for (const [teamId, instances] of groupsByTeamId) {
		for (const inst of instances) {
			const seasonId = inst.data.season?.id
			if (!seasonId) continue
			const subSnap = await db
				.collection(STAGING.teams)
				.doc(teamId)
				.collection('teamSeasons')
				.doc(seasonId)
				.get()
			if (!subSnap.exists) {
				errors.push(
					`teams_new/${teamId}/teamSeasons/${seasonId} missing (legacy doc ${inst.docId})`
				)
				continue
			}
			const subData = subSnap.data()
			if (subData.registered !== (inst.data.registered ?? false)) {
				errors.push(
					`teams_new/${teamId}/teamSeasons/${seasonId}.registered drift (was ${inst.data.registered}, is ${subData.registered})`
				)
			}
			if ((subData.name ?? null) !== (inst.data.name ?? null)) {
				errors.push(
					`teams_new/${teamId}/teamSeasons/${seasonId}.name drift (was ${inst.data.name}, is ${subData.name})`
				)
			}

			// Roster cardinality check.
			const expectedRoster = Array.isArray(inst.data.roster)
				? inst.data.roster.length
				: 0
			const rosterSnap = await db
				.collection(STAGING.teams)
				.doc(teamId)
				.collection('teamSeasons')
				.doc(seasonId)
				.collection('roster')
				.get()
			if (rosterSnap.size !== expectedRoster) {
				errors.push(
					`teams_new/${teamId}/teamSeasons/${seasonId}/roster has ${rosterSnap.size} docs, expected ${expectedRoster}`
				)
			}

			// idmap entry exists for the legacy doc.
			const idmapSnap = await db
				.collection(STAGING.idmap)
				.doc(inst.docId)
				.get()
			if (!idmapSnap.exists) {
				errors.push(
					`teams_new_idmap/${inst.docId} missing (canonical ${teamId})`
				)
			}
		}
	}

	// 3. Every player season array entry has a staged doc.
	let stagedPlayerSeasons = 0
	let captainStaged = 0
	for (const pDoc of playersSnap.docs) {
		const pData = pDoc.data()
		const seasons = Array.isArray(pData.seasons) ? pData.seasons : []
		for (const entry of seasons) {
			const seasonId = entry?.season?.id
			if (!seasonId) continue
			const stageSnap = await db
				.collection(STAGING.playerSeasons)
				.doc(`${pDoc.id}__${seasonId}`)
				.get()
			if (!stageSnap.exists) {
				errors.push(
					`players_new_seasons/${pDoc.id}__${seasonId} missing (player has array entry)`
				)
				continue
			}
			stagedPlayerSeasons++
			const sData = stageSnap.data()
			if (sData.captain) captainStaged++
			// paid/signed/banned compare booleans only; non-boolean values in legacy
			// data are normalized to false during staging (see migrate phase notes).
			if ((entry.paid === true) !== sData.paid)
				errors.push(`players_new_seasons/${pDoc.id}__${seasonId} paid drift`)
			if ((entry.signed === true) !== sData.signed)
				errors.push(`players_new_seasons/${pDoc.id}__${seasonId} signed drift`)
			if ((entry.banned === true) !== sData.banned)
				errors.push(`players_new_seasons/${pDoc.id}__${seasonId} banned drift`)
			// Team ref must point at staging teams_new collection if originally set.
			if (entry?.team?.id) {
				const expectedCanonicalTeamId = legacyDocIdToCanonical.get(entry.team.id)
				if (!expectedCanonicalTeamId) {
					errors.push(
						`player ${pDoc.id} season ${seasonId} has dangling team ref ${entry.team.id}`
					)
				} else if (sData.team?.id !== expectedCanonicalTeamId) {
					errors.push(
						`players_new_seasons/${pDoc.id}__${seasonId}.team mismatch (expected ${expectedCanonicalTeamId}, got ${sData.team?.id})`
					)
				}
			} else if (sData.team) {
				warnings.push(
					`players_new_seasons/${pDoc.id}__${seasonId}.team set but legacy was null`
				)
			}
		}
	}

	// 4. Round-trip check: for every staged roster entry, the corresponding
	// player has a captain-or-not staged doc that matches.
	for (const [teamId, instances] of groupsByTeamId) {
		for (const inst of instances) {
			const seasonId = inst.data.season?.id
			if (!seasonId) continue
			const roster = Array.isArray(inst.data.roster) ? inst.data.roster : []
			for (const entry of roster) {
				const playerId = entry?.player?.id
				if (!playerId) continue
				const stageSnap = await db
					.collection(STAGING.playerSeasons)
					.doc(`${playerId}__${seasonId}`)
					.get()
				if (!stageSnap.exists) {
					errors.push(
						`roster ${teamId}/${seasonId}/${playerId}: no staged player season`
					)
					continue
				}
				const sData = stageSnap.data()
				if (sData.team?.id !== teamId) {
					errors.push(
						`roster ${teamId}/${seasonId}/${playerId}: staged player.team is ${sData.team?.id}, expected ${teamId}`
					)
				}
				// Captain SOT is the team-side roster entry. Compare strictly against
				// the staged value (which was derived from the same source).
				if ((entry.captain === true) !== sData.captain) {
					errors.push(
						`roster ${teamId}/${seasonId}/${playerId}: captain mismatch (roster=${entry.captain === true}, staged=${sData.captain})`
					)
				}
			}
		}
	}

	console.log(`\nValidation summary:`)
	console.log(`  staged player seasons:    ${stagedPlayerSeasons}`)
	console.log(`  staged captains:          ${captainStaged}`)
	console.log(`  errors:                   ${errors.length}`)
	console.log(`  warnings:                 ${warnings.length}`)

	if (errors.length > 0) {
		console.log('\n❌ Errors:')
		for (const e of errors.slice(0, 50)) console.log(`  - ${e}`)
		if (errors.length > 50) console.log(`  …and ${errors.length - 50} more`)
		process.exit(1)
	}
	if (warnings.length > 0) {
		console.log('\n⚠️  Warnings:')
		for (const w of warnings.slice(0, 20)) console.log(`  - ${w}`)
		if (warnings.length > 20) console.log(`  …and ${warnings.length - 20} more`)
	}
	console.log('\n✅ validate passed.')
}

// ---- Phase D: cutover ------------------------------------------------------

/**
 * Destructive swap. Reads from staging (teams_new, teams_new_idmap,
 * players_new_seasons) and applies the new shape to the canonical
 * collections, replacing the legacy data.
 *
 * Steps:
 *   1. Delete every doc + subcollection under teams/* (legacy shape).
 *   2. Copy teams_new/{teamId} → teams/{teamId} (with seasons + roster + badges).
 *   3. For each player, rewrite parent doc to remove `seasons` array, then
 *      write players/{uid}/playerSeasons/{seasonId} subdocs from staging.
 *   4. Rewrite games/{gameId}.home/.away from legacy doc id refs to canonical
 *      teams/{canonicalId} refs (using teams_new_idmap).
 *   5. Rewrite offers/{offerId}.team similarly.
 *   6. Drop seasons/{id}.teams[] arrays (they pointed at legacy doc ids).
 *   7. Delete the staging collections (teams_new, teams_new_idmap,
 *      players_new_seasons).
 *
 * Idempotent against re-runs as long as the staging collections still exist.
 * Requires --commit.
 */
async function runCutover() {
	logHeader('Phase D — cutover (destructive swap)')

	if (!COMMIT) {
		console.log('⚠️  Dry run — pass --commit to perform the destructive swap.')
	}

	// ---- Read all staging data first --------------------------------------
	const teamsNewSnap = await db.collection(STAGING.teams).get()
	const idmapSnap = await db.collection(STAGING.idmap).get()
	const playersNewSeasonsSnap = await db.collection(STAGING.playerSeasons).get()

	if (teamsNewSnap.empty || idmapSnap.empty || playersNewSeasonsSnap.empty) {
		console.error(
			'\n❌ Staging collections are empty. Run --mode=migrate --commit first.'
		)
		process.exit(1)
	}

	console.log(
		`Staging contains ${teamsNewSnap.size} canonical teams, ` +
			`${idmapSnap.size} idmap entries, ${playersNewSeasonsSnap.size} player seasons.`
	)

	// legacyDocId → canonicalTeamId
	const legacyToCanonical = new Map()
	for (const doc of idmapSnap.docs) {
		legacyToCanonical.set(doc.id, doc.data().canonicalTeamId)
	}

	// Group player season staging docs by playerId.
	const stagingByPlayerId = new Map()
	for (const doc of playersNewSeasonsSnap.docs) {
		const data = doc.data()
		if (!stagingByPlayerId.has(data.playerId))
			stagingByPlayerId.set(data.playerId, [])
		stagingByPlayerId.get(data.playerId).push({ id: doc.id, data })
	}

	// Pre-load each canonical team's full subtree from staging.
	const canonicalTeamSubtrees = []
	for (const teamDoc of teamsNewSnap.docs) {
		const teamId = teamDoc.id
		const data = teamDoc.data()
		const seasonsSnap = await teamDoc.ref.collection('teamSeasons').get()
		const seasonRosters = []
		for (const seasonDoc of seasonsSnap.docs) {
			const rosterSnap = await seasonDoc.ref.collection('roster').get()
			seasonRosters.push({
				seasonId: seasonDoc.id,
				seasonData: seasonDoc.data(),
				rosterDocs: rosterSnap.docs.map((d) => ({
					id: d.id,
					data: d.data(),
				})),
			})
		}
		const badgesSnap = await teamDoc.ref.collection('badges').get()
		canonicalTeamSubtrees.push({
			teamId,
			parentData: data,
			seasonRosters,
			badgeDocs: badgesSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
		})
	}

	if (!COMMIT) {
		console.log(`\nWould perform the following operations:`)
		console.log(`  - Delete all legacy teams/* docs and their subcollections`)
		console.log(
			`  - Write ${canonicalTeamSubtrees.length} canonical teams (with seasons, rosters, badges)`
		)
		console.log(
			`  - Rewrite ${stagingByPlayerId.size} players' seasons (array → subcollection)`
		)
		console.log(`  - Rewrite games team refs (canonical only)`)
		console.log(`  - Rewrite offers team refs (canonical only)`)
		console.log(`  - Drop seasons/{id}.teams[] arrays`)
		console.log(`  - Delete staging collections`)
		console.log(`\n💡 Re-run with --commit to apply.`)
		return
	}

	// ---- 1. Delete legacy teams/* recursively -----------------------------
	console.log(`\n[1/7] Deleting legacy teams/* and their subcollections…`)
	const legacyTeamsSnap = await db.collection('teams').get()
	for (const doc of legacyTeamsSnap.docs) {
		await db.recursiveDelete(doc.ref)
	}
	console.log(`     deleted ${legacyTeamsSnap.size} legacy team docs`)

	// ---- 2. Write canonical teams ----------------------------------------
	console.log(`\n[2/7] Writing ${canonicalTeamSubtrees.length} canonical teams…`)
	const teamsCol = db.collection('teams')
	let teamsWritten = 0
	for (const tree of canonicalTeamSubtrees) {
		const teamRef = teamsCol.doc(tree.teamId)
		const writes = []

		// Convert any teams_new staging team refs back to teams/{canonicalId}.
		// Right now teamSeasonData.season is fine (it's a season ref), but the
		// staging-side team refs that might leak need rewriting. There aren't any
		// in the team-side data — only in player-side data. Skip rewriting here.
		writes.push((batch) =>
			batch.set(teamRef, {
				createdAt: tree.parentData.createdAt,
				createdBy: tree.parentData.createdBy ?? null,
			})
		)
		for (const sr of tree.seasonRosters) {
			const seasonRef = teamRef.collection('teamSeasons').doc(sr.seasonId)
			writes.push((batch) => batch.set(seasonRef, sr.seasonData))
			for (const rd of sr.rosterDocs) {
				const rosterEntryRef = seasonRef.collection('roster').doc(rd.id)
				writes.push((batch) => batch.set(rosterEntryRef, rd.data))
			}
		}
		for (const bd of tree.badgeDocs) {
			const badgeRef = teamRef.collection('badges').doc(bd.id)
			writes.push((batch) => batch.set(badgeRef, bd.data))
		}
		await batchCommit(writes)
		teamsWritten++
	}
	console.log(`     wrote ${teamsWritten} canonical teams`)

	// ---- 3. Rewrite players' seasons array → subcollection ----------------
	console.log(
		`\n[3/7] Rewriting players' seasons (array → subcollection) for ${stagingByPlayerId.size} players…`
	)
	let playersUpdated = 0
	let playerSeasonsWritten = 0
	for (const [playerId, stagedDocs] of stagingByPlayerId) {
		const playerRef = db.collection('players').doc(playerId)
		const writes = []

		// Strip the seasons array from the parent doc.
		writes.push((batch) =>
			batch.update(playerRef, {
				seasons: FieldValue.delete(),
			})
		)

		// Defensive: remove any pre-rename legacy `players/{uid}/seasons/*`
		// subdocs left over from emulator runs performed before the
		// seasons → playerSeasons rename. Safe no-op against production data.
		const legacySeasonsSnap = await playerRef.collection('seasons').get()
		for (const legacyDoc of legacySeasonsSnap.docs) {
			writes.push((batch) => batch.delete(legacyDoc.ref))
		}

		// Write each subcollection doc, rewriting the staging team ref into a
		// canonical teams/{teamId} ref.
		for (const { data } of stagedDocs) {
			const seasonSubRef = playerRef
				.collection('playerSeasons')
				.doc(data.seasonId)
			let teamRef = null
			if (data.team?.id) {
				teamRef = db.collection('teams').doc(data.team.id)
			}
			writes.push((batch) =>
				batch.set(seasonSubRef, {
					season: data.season,
					team: teamRef,
					paid: data.paid,
					signed: data.signed,
					banned: data.banned,
					captain: data.captain,
				})
			)
			playerSeasonsWritten++
		}
		await batchCommit(writes)
		playersUpdated++
	}
	console.log(
		`     updated ${playersUpdated} players, wrote ${playerSeasonsWritten} season subdocs`
	)

	// ---- 4. Rewrite games' team refs --------------------------------------
	console.log(`\n[4/7] Rewriting games team refs…`)
	const gamesSnap = await db.collection('games').get()
	const gameWrites = []
	let gamesRewritten = 0
	for (const gDoc of gamesSnap.docs) {
		const data = gDoc.data()
		const updates = {}
		if (data.home?.id) {
			const canonicalId = legacyToCanonical.get(data.home.id)
			if (canonicalId) {
				updates.home = db.collection('teams').doc(canonicalId)
			}
		}
		if (data.away?.id) {
			const canonicalId = legacyToCanonical.get(data.away.id)
			if (canonicalId) {
				updates.away = db.collection('teams').doc(canonicalId)
			}
		}
		if (Object.keys(updates).length > 0) {
			gameWrites.push((batch) => batch.update(gDoc.ref, updates))
			gamesRewritten++
		}
	}
	await batchCommit(gameWrites)
	console.log(`     rewrote ${gamesRewritten}/${gamesSnap.size} games`)

	// ---- 5. Rewrite offers' team refs -------------------------------------
	console.log(`\n[5/7] Rewriting offers team refs…`)
	const offersSnap = await db.collection('offers').get()
	const offerWrites = []
	let offersRewritten = 0
	for (const oDoc of offersSnap.docs) {
		const data = oDoc.data()
		if (data.team?.id) {
			const canonicalId = legacyToCanonical.get(data.team.id)
			if (canonicalId) {
				offerWrites.push((batch) =>
					batch.update(oDoc.ref, {
						team: db.collection('teams').doc(canonicalId),
					})
				)
				offersRewritten++
			}
		}
	}
	await batchCommit(offerWrites)
	console.log(`     rewrote ${offersRewritten}/${offersSnap.size} offers`)

	// ---- 6. Drop seasons/{id}.teams[] arrays ------------------------------
	console.log(`\n[6/7] Dropping seasons/{id}.teams[] arrays…`)
	const seasonsSnap = await db.collection('seasons').get()
	const seasonWrites = []
	let seasonsTouched = 0
	for (const sDoc of seasonsSnap.docs) {
		if (sDoc.data().teams !== undefined) {
			seasonWrites.push((batch) =>
				batch.update(sDoc.ref, { teams: FieldValue.delete() })
			)
			seasonsTouched++
		}
	}
	await batchCommit(seasonWrites)
	console.log(`     dropped teams[] from ${seasonsTouched} seasons`)

	// ---- 7. Delete staging collections ------------------------------------
	console.log(`\n[7/7] Deleting staging collections…`)
	for (const colName of [STAGING.teams, STAGING.idmap, STAGING.playerSeasons]) {
		const snap = await db.collection(colName).get()
		for (const doc of snap.docs) {
			await db.recursiveDelete(doc.ref)
		}
		console.log(`     deleted ${snap.size} docs from ${colName}`)
	}

	console.log('\n✅ cutover complete.')
}

// ---- Phase E: rollback -----------------------------------------------------

async function runRollback() {
	logHeader('Phase E — rollback (delete staging collections)')
	if (!COMMIT) {
		console.log('⚠️  Dry run — pass --commit to delete staging collections.')
	}
	const collections = [STAGING.teams, STAGING.idmap, STAGING.playerSeasons]
	for (const col of collections) {
		const snap = await db.collection(col).get()
		console.log(`  ${col}: ${snap.size} top-level docs to delete`)
		if (!COMMIT) continue
		// recursive delete via the admin SDK
		for (const doc of snap.docs) {
			await db.recursiveDelete(doc.ref)
		}
	}
	if (COMMIT) console.log('\n✅ rollback complete.')
}

// ---- Main ------------------------------------------------------------------

async function main() {
	console.log(`Minneapolis Winter League — 2026 teams/players migration`)
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)

	switch (MODE) {
		case 'plan':
			await runPlan()
			break
		case 'migrate':
			await runMigrate()
			break
		case 'validate':
			await runValidate()
			break
		case 'rollback':
			await runRollback()
			break
		case 'cutover':
			await runCutover()
			break
	}

	await app.delete()
}

main().catch((err) => {
	console.error('❌ Migration failed:', err)
	app.delete()
	process.exit(1)
})
