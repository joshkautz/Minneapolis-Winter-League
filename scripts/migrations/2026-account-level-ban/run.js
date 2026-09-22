#!/usr/bin/env node
/**
 * Backfill `banned` onto every player document.
 *
 * A ban is a fact about a person, but it used to live on the per-season
 * subdoc at `players/{uid}/playerSeasons/{seasonId}.banned`. Three separate
 * code paths — createSeason, createTeam and rolloverTeam — copied it forward
 * onto each new subdoc, so it already behaved as an account-level flag. It
 * simply could not be lifted: clearing one season left the others set, and
 * the next carry-forward reinstated it.
 *
 * For each player:
 *   - Set `banned = true` when ANY of their season subdocs has
 *     `banned: true`, matching what the carry-forward sites assumed.
 *   - Set `banned = false` otherwise, so the field is present on every
 *     player and the fallback read in `isPlayerBanned` stops firing.
 *   - Skip players whose `banned` already matches (idempotent re-runs).
 *
 * The season subdocs are deliberately left alone. `isPlayerBanned` falls
 * back to them for any player this has not reached, so they must stay
 * truthful until the field is removed in a follow-up.
 *
 * Modes:
 *   --mode=plan       (default) read-only summary of who would be banned
 *                     and how many documents would be written. No writes.
 *   --mode=migrate    write the flag. Use --commit to actually apply.
 *   --mode=cleanup    delete the now-unread `banned` field from every season
 *                     subdoc. Run this only after `migrate` has completed and
 *                     the code that reads the season field has shipped —
 *                     while that fallback exists, these values are the only
 *                     thing keeping unmigrated players banned.
 *
 * Examples:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-account-level-ban/run.js --mode=plan
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-account-level-ban/run.js --mode=migrate --commit
 *
 * Against production: omit FIRESTORE_EMULATOR_HOST. Uses ADC.
 */

import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'minnesota-winter-league'
const VALID_MODES = ['plan', 'migrate', 'cleanup']
const PLAYER_SEASONS_SUBCOLLECTION = 'playerSeasons'

// Firestore caps a write batch at 500 operations.
const BATCH_LIMIT = 400

const args = process.argv.slice(2)
const modeArg = args.find((a) => a.startsWith('--mode='))
const MODE = modeArg ? modeArg.split('=')[1] : 'plan'
const COMMIT = args.includes('--commit')

if (!VALID_MODES.includes(MODE)) {
	console.error(`Invalid mode: ${MODE}. Valid modes: ${VALID_MODES.join(', ')}`)
	process.exit(1)
}

const app = initializeApp({ projectId: PROJECT_ID })
const db = getFirestore(app)

function logHeader(title) {
	const bar = '━'.repeat(60)
	console.log(`\n${bar}\n  ${title}\n${bar}`)
}

/**
 * Deletes the deprecated per-season `banned` field.
 *
 * Nothing reads it any more, so the values are inert — but they are also
 * frozen at whatever they were when the migration ran, and a reader finding
 * `banned: true` on a season subdoc for a player who has since been unbanned
 * would be badly misled.
 */
async function cleanup() {
	logHeader('Reading season subdocs')
	const seasons = await db.collectionGroup('playerSeasons').get()
	const withField = seasons.docs.filter(
		(doc) => doc.data()?.banned !== undefined
	)

	console.log(`Season subdocs found:          ${seasons.size}`)
	console.log(`Still carrying the field:      ${withField.length}`)
	console.log(
		`  of those, set to true:       ${withField.filter((d) => d.data()?.banned === true).length}`
	)

	if (!COMMIT) {
		console.log('\nDry run. Add --commit to apply.')
		return
	}

	logHeader('Deleting')
	let written = 0
	for (let i = 0; i < withField.length; i += BATCH_LIMIT) {
		const batch = db.batch()
		for (const doc of withField.slice(i, i + BATCH_LIMIT)) {
			batch.update(doc.ref, { banned: FieldValue.delete() })
		}
		await batch.commit()
		written += Math.min(BATCH_LIMIT, withField.length - i)
		console.log(`  committed ${written}/${withField.length}`)
	}

	console.log(`\nDone. Cleared the field from ${written} season subdoc(s).`)
}

async function main() {
	console.log('Minneapolis Winter League — backfill account-level bans')
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)
	console.log(`Target:  ${process.env.FIRESTORE_EMULATOR_HOST ?? 'PRODUCTION'}`)

	if (MODE === 'cleanup') {
		await cleanup()
		return
	}

	logHeader('Reading players')
	const players = await db.collection('players').get()
	console.log(`Found ${players.size} players`)

	// Refuse to run once cleanup has removed the source data.
	//
	// This derives each player's ban from their season subdocs. After
	// `--mode=cleanup` those subdocs no longer carry the field, so every
	// player derives as not banned — and re-running this would quietly clear
	// the real, account-level bans instead of restoring them. The migration
	// is a one-way step and there is nothing here to re-run.
	// A full scan rather than a `where`, because filtering on `banned` needs
	// a collection-group index that no longer has any reason to exist.
	const allSeasons = await db
		.collectionGroup(PLAYER_SEASONS_SUBCOLLECTION)
		.get()
	const sourceDataGone = allSeasons.docs.every(
		(doc) => doc.data()?.banned === undefined
	)
	if (sourceDataGone) {
		const bannedNow = await db
			.collection('players')
			.where('banned', '==', true)
			.get()
		console.error(
			'\nRefusing to run: no season subdoc carries `banned` any more, so' +
				' this has already been migrated and cleaned up.' +
				`\nThe league currently has ${bannedNow.size} banned player(s), held on` +
				' the player documents.' +
				'\nRunning anyway would derive "not banned" for everyone and clear them.'
		)
		process.exitCode = 1
		return
	}

	const pending = []
	let alreadyCorrect = 0
	const bannedPlayers = []

	for (const playerDoc of players.docs) {
		const seasons = await playerDoc.ref
			.collection(PLAYER_SEASONS_SUBCOLLECTION)
			.get()
		const bannedInAnySeason = seasons.docs.some(
			(d) => d.data()?.banned === true
		)

		if (bannedInAnySeason) {
			const data = playerDoc.data()
			bannedPlayers.push(
				`${data?.firstname ?? '?'} ${data?.lastname ?? '?'} (${playerDoc.id})` +
					` — banned in ${seasons.docs.filter((d) => d.data()?.banned === true).length}` +
					`/${seasons.size} season(s)`
			)
		}

		if (playerDoc.data()?.banned === bannedInAnySeason) {
			alreadyCorrect++
			continue
		}
		pending.push({ ref: playerDoc.ref, banned: bannedInAnySeason })
	}

	logHeader('Plan')
	console.log(`Players already correct:   ${alreadyCorrect}`)
	console.log(`Players to write:          ${pending.length}`)
	console.log(`Players banned after this: ${bannedPlayers.length}`)

	if (bannedPlayers.length > 0) {
		console.log('\nBanned players:')
		for (const line of bannedPlayers) {
			console.log(`  • ${line}`)
		}
	}

	if (MODE === 'plan') {
		console.log('\nPlan only. Re-run with --mode=migrate --commit to apply.')
		return
	}

	if (!COMMIT) {
		console.log('\nDry run. Add --commit to apply.')
		return
	}

	logHeader('Writing')
	let written = 0
	for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
		const batch = db.batch()
		for (const { ref, banned } of pending.slice(i, i + BATCH_LIMIT)) {
			batch.update(ref, { banned })
		}
		await batch.commit()
		written += Math.min(BATCH_LIMIT, pending.length - i)
		console.log(`  committed ${written}/${pending.length}`)
	}

	console.log(`\nDone. Wrote ${written} player document(s).`)
	console.log(
		'The per-season `banned` field is intentionally left in place; it is' +
			' still the fallback for anything this run missed.'
	)
}

main().catch((error) => {
	console.error('\nMigration failed:', error)
	process.exit(1)
})
