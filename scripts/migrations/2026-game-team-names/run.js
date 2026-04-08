#!/usr/bin/env node
/**
 * Backfill `homeName` / `awayName` on every game document.
 *
 * After the GameDocument schema gained denormalized `homeName`/`awayName`
 * fields, every game created by `createGame`/`updateGame` going forward
 * will have them populated. This script backfills the existing games.
 *
 * For each game:
 *   - If `home != null`, set `homeName = teams/{home.id}/teamSeasons/{season.id}.name`
 *   - If `away != null`, set `awayName = teams/{away.id}/teamSeasons/{season.id}.name`
 *   - Skip games that already have both fields set (idempotent re-runs).
 *
 * Modes:
 *   --mode=plan       (default) read-only summary of how many games will
 *                     be touched and how many team-season name lookups
 *                     will be issued. No writes.
 *   --mode=migrate    write the names. Use --commit to actually apply.
 *
 * Examples:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-game-team-names/run.js --mode=plan
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-game-team-names/run.js --mode=migrate --commit
 *
 * Against production: omit FIRESTORE_EMULATOR_HOST. Uses ADC.
 */

import admin from 'firebase-admin'

const PROJECT_ID = 'minnesota-winter-league'
const VALID_MODES = ['plan', 'migrate']

const args = process.argv.slice(2)
const modeArg = args.find((a) => a.startsWith('--mode='))
const MODE = modeArg ? modeArg.split('=')[1] : 'plan'
const COMMIT = args.includes('--commit')

if (!VALID_MODES.includes(MODE)) {
	console.error(`Invalid mode: ${MODE}. Valid modes: ${VALID_MODES.join(', ')}`)
	process.exit(1)
}

const app = admin.initializeApp({ projectId: PROJECT_ID })
const db = app.firestore()

function logHeader(title) {
	const bar = '━'.repeat(60)
	console.log(`\n${bar}\n  ${title}\n${bar}`)
}

async function main() {
	console.log(`Minneapolis Winter League — backfill game team names`)
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)

	logHeader(`Phase A — read all games`)

	const gamesSnap = await db.collection('games').get()
	console.log(`Loaded ${gamesSnap.size} games.`)

	// Cache team-season name lookups: `${teamId}__${seasonId}` → name
	const nameCache = new Map()

	const lookups = async (teamId, seasonId) => {
		const key = `${teamId}__${seasonId}`
		if (nameCache.has(key)) return nameCache.get(key)
		try {
			const subdoc = await db
				.collection('teams')
				.doc(teamId)
				.collection('teamSeasons')
				.doc(seasonId)
				.get()
			const name = subdoc.exists ? (subdoc.data()?.name ?? null) : null
			nameCache.set(key, name)
			return name
		} catch {
			nameCache.set(key, null)
			return null
		}
	}

	let alreadyComplete = 0
	let needsBackfill = 0
	let homeNamesToSet = 0
	let awayNamesToSet = 0
	let danglingHome = 0
	let danglingAway = 0

	const writes = []

	for (const gameDoc of gamesSnap.docs) {
		const data = gameDoc.data()
		const seasonId = data.season?.id
		if (!seasonId) continue

		const update = {}

		if (data.home && (data.homeName === undefined || data.homeName === null)) {
			const name = await lookups(data.home.id, seasonId)
			if (name) {
				update.homeName = name
				homeNamesToSet++
			} else {
				danglingHome++
			}
		}
		if (data.away && (data.awayName === undefined || data.awayName === null)) {
			const name = await lookups(data.away.id, seasonId)
			if (name) {
				update.awayName = name
				awayNamesToSet++
			} else {
				danglingAway++
			}
		}

		// If `home` is null but `homeName` is undefined, also explicitly set it
		// to null so the field exists on every doc (for query consistency).
		if (data.home === null && data.homeName === undefined) {
			update.homeName = null
		}
		if (data.away === null && data.awayName === undefined) {
			update.awayName = null
		}

		if (Object.keys(update).length === 0) {
			alreadyComplete++
			continue
		}

		needsBackfill++
		writes.push({ ref: gameDoc.ref, update })
	}

	console.log(`\nSummary:`)
	console.log(`  total games:                       ${gamesSnap.size}`)
	console.log(`  already complete (no writes):      ${alreadyComplete}`)
	console.log(`  games needing backfill:            ${needsBackfill}`)
	console.log(`  homeName values to set:            ${homeNamesToSet}`)
	console.log(`  awayName values to set:            ${awayNamesToSet}`)
	console.log(`  dangling home refs (no team-season): ${danglingHome}`)
	console.log(`  dangling away refs (no team-season): ${danglingAway}`)
	console.log(`  unique team-season name lookups:   ${nameCache.size}`)

	if (MODE === 'plan') {
		console.log(`\n💡 Re-run with --mode=migrate --commit to apply.`)
		await app.delete()
		return
	}

	if (!COMMIT) {
		console.log(
			`\n⚠️  Dry run — no Firestore writes performed. Pass --commit to apply.`
		)
		await app.delete()
		return
	}

	logHeader(`Phase B — applying ${writes.length} writes in batches of 400`)
	const BATCH_LIMIT = 400
	let written = 0
	for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
		const batch = db.batch()
		const chunk = writes.slice(i, i + BATCH_LIMIT)
		for (const { ref, update } of chunk) {
			batch.update(ref, update)
		}
		await batch.commit()
		written += chunk.length
		console.log(`  committed ${written}/${writes.length}`)
	}

	console.log(`\n✅ Backfill complete: ${written} games updated.`)
	await app.delete()
}

main().catch((err) => {
	console.error('❌ Backfill failed:', err)
	process.exit(1)
})
