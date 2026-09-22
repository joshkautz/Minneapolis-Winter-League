#!/usr/bin/env node
/**
 * Delete composite indexes that exist in Firestore but not in
 * `firestore.indexes.json`.
 *
 * CI deploys indexes without `--force`, so an index present only in
 * production is never removed. Six accumulated that way, all left behind by
 * the 2026 data model migration — they cover collections and fields that no
 * longer exist, or query shapes nothing issues any more.
 *
 * Keeping them is not expensive, but it means the checked-in file is not the
 * truth, and the next person comparing the two has to work out which
 * difference matters. This closes the gap in the direction that makes the
 * file authoritative.
 *
 * The deletion list is derived, not hardcoded: anything in Firestore and not
 * in the file. Firestore appends an implicit `__name__` field to every
 * composite index, which the file omits, so that field is ignored when
 * comparing — otherwise every index looks like a difference.
 *
 * Modes:
 *   --mode=plan       (default) read-only. Lists what would be deleted.
 *   --mode=prune      delete. Use --commit to actually apply.
 *
 * Deleting an index breaks any query that depends on it, with a clear error
 * naming the index and a console link to recreate it. Rebuilding takes
 * minutes on a dataset this size. Check `plan` output against the codebase
 * before committing.
 *
 * Uses ADC. There is no emulator equivalent — the emulator does not enforce
 * composite indexes, which is why the drift went unnoticed.
 */

import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = 'minnesota-winter-league'
const API = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/-/indexes`

const args = process.argv.slice(2)
const modeArg = args.find((a) => a.startsWith('--mode='))
const MODE = modeArg ? modeArg.split('=')[1] : 'plan'
const COMMIT = args.includes('--commit')

if (!['plan', 'prune'].includes(MODE)) {
	console.error(`Invalid mode: ${MODE}. Valid modes: plan, prune`)
	process.exit(1)
}

/**
 * A comparable description of an index.
 *
 * `__name__` is dropped: Firestore appends it to every composite index and
 * the checked-in file never lists it, so including it would make every
 * index look unmatched.
 */
function signature(index) {
	const fields = (index.fields ?? [])
		.filter((f) => f.fieldPath !== '__name__')
		.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`)
		.join(',')
	return `${index.collectionGroup} [${index.queryScope ?? 'COLLECTION'}] ${fields}`
}

/** The collection group is only in the resource name, not the payload. */
function collectionGroupOf(name) {
	return name.match(/collectionGroups\/([^/]+)\/indexes/)?.[1] ?? '?'
}

function logHeader(title) {
	const bar = '━'.repeat(60)
	console.log(`\n${bar}\n  ${title}\n${bar}`)
}

async function main() {
	console.log('Minneapolis Winter League — prune orphaned Firestore indexes')
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)

	const auth = new GoogleAuth({
		scopes: ['https://www.googleapis.com/auth/datastore'],
	})
	const client = await auth.getClient()

	logHeader('Reading indexes')
	const live = []
	let pageToken
	do {
		const url = pageToken ? `${API}?pageToken=${pageToken}` : API
		const { data } = await client.request({ url })
		for (const index of data.indexes ?? []) {
			live.push({
				...index,
				collectionGroup: collectionGroupOf(index.name),
			})
		}
		pageToken = data.nextPageToken
	} while (pageToken)

	const declared = new Set(
		JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes.map(
			signature
		)
	)
	const orphaned = live.filter((i) => !declared.has(signature(i)))

	console.log(`In Firestore:            ${live.length}`)
	console.log(`In firestore.indexes.json: ${declared.size}`)
	console.log(`Orphaned:                ${orphaned.length}`)

	if (orphaned.length === 0) {
		console.log('\nNothing to do — the file is the truth.')
		return
	}

	logHeader('Would delete')
	for (const index of orphaned) {
		console.log(`  • ${signature(index)}`)
	}

	if (MODE === 'plan') {
		console.log('\nPlan only. Re-run with --mode=prune --commit to apply.')
		return
	}
	if (!COMMIT) {
		console.log('\nDry run. Add --commit to apply.')
		return
	}

	logHeader('Deleting')
	for (const index of orphaned) {
		await client.request({
			url: `https://firestore.googleapis.com/v1/${index.name}`,
			method: 'DELETE',
		})
		console.log(`  deleted ${signature(index)}`)
	}
	console.log(`\nDone. Deleted ${orphaned.length} index(es).`)
}

main().catch((error) => {
	console.error('\nFailed:', error?.response?.data ?? error)
	process.exit(1)
})
