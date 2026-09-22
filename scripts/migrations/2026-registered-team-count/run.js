#!/usr/bin/env node
/**
 * Backfill `registeredTeamCount` onto every season document.
 *
 * Registration is a race for twelve spots. Deciding whether a spot is free by
 * counting registered teams with a collection-group query cannot be done
 * consistently inside a transaction, so the count lives on the season
 * document and is incremented in the same transaction that registers a team.
 *
 * This sets the starting value for seasons that predate the counter: the
 * number of team-seasons already marked `registered`.
 *
 * Idempotent — re-running only writes seasons whose stored count disagrees
 * with the live one.
 *
 * Modes:
 *   --mode=plan       (default) read-only. Shows the count per season.
 *   --mode=migrate    write. Use --commit to actually apply.
 *
 * Examples:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-registered-team-count/run.js --mode=plan
 *
 * Against production: omit FIRESTORE_EMULATOR_HOST. Uses ADC.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'minnesota-winter-league'
const VALID_MODES = ['plan', 'migrate']
const TEAM_SEASONS_SUBCOLLECTION = 'teamSeasons'

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

async function main() {
	console.log('Minneapolis Winter League — backfill registeredTeamCount')
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)
	console.log(`Target:  ${process.env.FIRESTORE_EMULATOR_HOST ?? 'PRODUCTION'}`)

	logHeader('Counting registered teams per season')
	const seasons = await db.collection('seasons').get()
	const pending = []

	for (const seasonDoc of seasons.docs) {
		const registered = await db
			.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
			.where('season', '==', seasonDoc.ref)
			.where('registered', '==', true)
			.get()

		const live = registered.size
		const stored = seasonDoc.data()?.registeredTeamCount
		const name = seasonDoc.data()?.name ?? seasonDoc.id

		console.log(
			`  ${name}: ${live} registered` +
				(stored === undefined ? ' (no counter yet)' : ` (stored: ${stored})`)
		)

		if (stored !== live) {
			pending.push({ ref: seasonDoc.ref, live, name })
		}
	}

	logHeader('Plan')
	console.log(`Seasons to write: ${pending.length}`)

	if (pending.length === 0) {
		console.log('\nNothing to do — every counter matches.')
		return
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
	const batch = db.batch()
	for (const { ref, live } of pending) {
		batch.update(ref, { registeredTeamCount: live })
	}
	await batch.commit()
	console.log(`\nDone. Wrote ${pending.length} season document(s).`)
}

main().catch((error) => {
	console.error('\nMigration failed:', error)
	process.exit(1)
})
