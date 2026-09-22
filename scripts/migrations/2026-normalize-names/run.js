#!/usr/bin/env node
/**
 * Normalize typographic characters in stored player names.
 *
 * `validateAndNormalizeName` converts curly apostrophes and typographic
 * hyphens to their ASCII equivalents before validating, so names written
 * from now on are stored in the plain form. Names stored before that will
 * keep whatever they were entered with — and two players in this league are
 * stored with a curly apostrophe (U+2019), which is what iOS and macOS type
 * by default.
 *
 * Leaving them is not harmless: the two forms sort and compare differently,
 * so a search for "O'Dowd" does not find "O’Dowd".
 *
 * This applies the same normalization to existing documents, and reports
 * anything it cannot make valid — a name containing quote marks, say — for
 * a human to decide about, rather than guessing.
 *
 * Modes:
 *   --mode=plan       (default) read-only. Lists every change it would make
 *                     and every name it cannot fix.
 *   --mode=migrate    apply. Use --commit to actually write.
 *
 * Examples:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-normalize-names/run.js --mode=plan
 *
 * Against production: omit FIRESTORE_EMULATOR_HOST. Uses ADC.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'minnesota-winter-league'
const VALID_MODES = ['plan', 'migrate']
const BATCH_LIMIT = 400

// Keep in sync with Functions/src/shared/names.ts.
const TYPOGRAPHIC_REPLACEMENTS = [
	[/[‘’ʼ՚]/g, "'"],
	[/[‐‑‒–—−]/g, '-'],
]
const ALLOWED_CHARACTERS = /^[\p{L}\p{M}\s'-]+$/u

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

/** The stored form `validateAndNormalizeName` would produce. */
function normalize(value) {
	return TYPOGRAPHIC_REPLACEMENTS.reduce(
		(text, [pattern, replacement]) => text.replace(pattern, replacement),
		value.trim()
	)
		.replace(/\s+/g, ' ')
		.replace(
			/(^|[\s'-])(\p{L})/gu,
			(_match, boundary, letter) => boundary + letter.toUpperCase()
		)
}

async function main() {
	console.log('Minneapolis Winter League — normalize player names')
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)
	console.log(`Target:  ${process.env.FIRESTORE_EMULATOR_HOST ?? 'PRODUCTION'}`)

	logHeader('Reading players')
	const players = await db.collection('players').get()
	console.log(`Found ${players.size} players`)

	const pending = []
	const unfixable = []

	for (const doc of players.docs) {
		const data = doc.data()
		const updates = {}

		for (const field of ['firstname', 'lastname']) {
			const value = data?.[field]
			if (typeof value !== 'string') continue

			const normalized = normalize(value)
			if (!ALLOWED_CHARACTERS.test(normalized)) {
				unfixable.push(
					`${doc.id} ${field}: ${JSON.stringify(value)} — contains characters that are not letters`
				)
				continue
			}
			if (normalized !== value) {
				updates[field] = normalized
			}
		}

		if (Object.keys(updates).length > 0) {
			pending.push({ ref: doc.ref, updates, before: data })
		}
	}

	logHeader('Plan')
	console.log(`Names to normalize: ${pending.length}`)
	for (const { updates, before } of pending) {
		for (const [field, to] of Object.entries(updates)) {
			console.log(
				`  • ${before?.firstname} ${before?.lastname} — ${field}: ${JSON.stringify(before?.[field])} -> ${JSON.stringify(to)}`
			)
		}
	}

	if (unfixable.length > 0) {
		console.log(
			`\nCannot normalize (needs a human decision): ${unfixable.length}`
		)
		for (const line of unfixable) console.log(`  • ${line}`)
		console.log(
			'  These are left untouched. The owner can correct them from the' +
				' admin player editor.'
		)
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
		for (const { ref, updates } of pending.slice(i, i + BATCH_LIMIT)) {
			batch.update(ref, updates)
		}
		await batch.commit()
		written += Math.min(BATCH_LIMIT, pending.length - i)
	}
	console.log(`\nDone. Normalized ${written} player document(s).`)
}

main().catch((error) => {
	console.error('\nMigration failed:', error)
	process.exit(1)
})
