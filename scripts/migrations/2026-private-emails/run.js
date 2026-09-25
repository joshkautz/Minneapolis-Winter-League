#!/usr/bin/env node
/**
 * Move each player's email off the public player document.
 *
 * `players/{uid}` is readable by anyone, signed in or not, so the `email`
 * field on it let anyone list every player's address. Emails now live in
 * `playerContacts/{uid}`, which only that player and admins can read.
 *
 * For each player:
 *   - Write `playerContacts/{uid}` with the lowercased email, unless one
 *     already exists. An existing contact was written by the new code
 *     (createPlayer, updatePlayerAdmin) and is newer than the player field.
 *   - A player with no email on their document and no contact gets the
 *     address from their Firebase Auth account, if they have one.
 *   - Delete `email` from the player document.
 *
 * Idempotent: a second run finds nothing to move. Run it after the code that
 * reads `playerContacts` has deployed; until then the admin screens read the
 * old field, which this removes.
 *
 * Modes:
 *   --mode=plan       (default) read-only summary. No writes.
 *   --mode=migrate    move the emails. Use --commit to actually apply.
 *
 * Examples:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *     GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-private-emails/run.js --mode=migrate --commit
 *
 * Against production: omit the emulator hosts. Uses ADC.
 */

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'minnesota-winter-league'
const VALID_MODES = ['plan', 'migrate']

// Firestore caps a write batch at 500 operations; each player takes two.
const PLAYERS_PER_BATCH = 200

// getUsers accepts at most 100 identifiers per call.
const AUTH_LOOKUP_LIMIT = 100

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
const auth = getAuth(app)

function logHeader(title) {
	const bar = '━'.repeat(60)
	console.log(`\n${bar}\n  ${title}\n${bar}`)
}

/** Auth emails for these uids, lowercased; accounts that do not exist are absent. */
async function authEmails(uids) {
	const emails = new Map()
	for (let i = 0; i < uids.length; i += AUTH_LOOKUP_LIMIT) {
		const { users } = await auth.getUsers(
			uids.slice(i, i + AUTH_LOOKUP_LIMIT).map((uid) => ({ uid }))
		)
		for (const user of users) {
			if (user.email) emails.set(user.uid, user.email.toLowerCase())
		}
	}
	return emails
}

async function main() {
	console.log('Minneapolis Winter League — make player emails private')
	console.log(`Project: ${PROJECT_ID}`)
	console.log(`Mode:    ${MODE}`)
	console.log(`Commit:  ${COMMIT}`)
	console.log(`Target:  ${process.env.FIRESTORE_EMULATOR_HOST ?? 'PRODUCTION'}`)

	logHeader('Reading')
	const [players, contacts] = await Promise.all([
		db.collection('players').get(),
		db.collection('playerContacts').get(),
	])
	const contactIds = new Set(contacts.docs.map((doc) => doc.id))
	console.log(`Players:           ${players.size}`)
	console.log(`Existing contacts: ${contacts.size}`)

	const withoutAnyEmail = players.docs.filter(
		(doc) => typeof doc.data().email !== 'string' && !contactIds.has(doc.id)
	)
	const fromAuth = await authEmails(withoutAnyEmail.map((doc) => doc.id))

	const plan = []
	let alreadyMigrated = 0
	const noEmailAnywhere = []

	for (const doc of players.docs) {
		const fieldEmail = doc.data().email
		const hasField = fieldEmail !== undefined
		const hasContact = contactIds.has(doc.id)

		let contactEmail = null
		if (!hasContact) {
			if (typeof fieldEmail === 'string' && fieldEmail.trim()) {
				contactEmail = fieldEmail.trim().toLowerCase()
			} else if (fromAuth.has(doc.id)) {
				contactEmail = fromAuth.get(doc.id)
			} else {
				noEmailAnywhere.push(doc.id)
			}
		}

		if (!hasField && contactEmail === null) {
			if (hasContact) alreadyMigrated++
			continue
		}
		plan.push({ id: doc.id, ref: doc.ref, hasField, contactEmail })
	}

	logHeader('Plan')
	console.log(`Already migrated:              ${alreadyMigrated}`)
	console.log(`Players to change:             ${plan.length}`)
	console.log(
		`  contacts to write:           ${plan.filter((p) => p.contactEmail).length}`
	)
	console.log(
		`    of those, from Auth:       ${plan.filter((p) => p.contactEmail && !p.hasField).length}`
	)
	console.log(
		`  fields to delete:            ${plan.filter((p) => p.hasField).length}`
	)
	console.log(`No email anywhere (left as is): ${noEmailAnywhere.length}`)
	for (const id of noEmailAnywhere) console.log(`  • ${id}`)

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
	for (let i = 0; i < plan.length; i += PLAYERS_PER_BATCH) {
		const batch = db.batch()
		for (const { id, ref, hasField, contactEmail } of plan.slice(
			i,
			i + PLAYERS_PER_BATCH
		)) {
			if (contactEmail) {
				batch.set(db.collection('playerContacts').doc(id), {
					email: contactEmail,
				})
			}
			if (hasField) batch.update(ref, { email: FieldValue.delete() })
		}
		await batch.commit()
		written += Math.min(PLAYERS_PER_BATCH, plan.length - i)
		console.log(`  committed ${written}/${plan.length}`)
	}

	const stillPublic = (await db.collection('players').get()).docs.filter(
		(doc) => doc.data().email !== undefined
	)
	console.log(`\nDone. Changed ${written} player(s).`)
	console.log(`Player documents still carrying an email: ${stillPublic.length}`)
	if (stillPublic.length > 0) process.exitCode = 1
}

main().catch((error) => {
	console.error('\nMigration failed:', error)
	process.exit(1)
})
