#!/usr/bin/env node

/**
 * Sets whether the league sends email: system/email.mode and its test
 * recipients. See docs/EMAIL.md.
 *
 *   node scripts/production/set-email-mode.js status
 *   node scripts/production/set-email-mode.js off
 *   node scripts/production/set-email-mode.js test josh@mplsmallard.com [more...]
 *   node scripts/production/set-email-mode.js live --confirm-live
 *
 * `live` sends email to players, so it needs --confirm-live. Uses ADC;
 * against the emulator, set FIRESTORE_EMULATOR_HOST.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const [mode, ...rest] = process.argv.slice(2)
const usage = () => {
	console.error(
		'Usage: set-email-mode.js status | off | test <address...> | live --confirm-live'
	)
	process.exit(1)
}
if (!['status', 'off', 'test', 'live'].includes(mode)) usage()

const app = initializeApp({ projectId: 'minnesota-winter-league' })
const ref = getFirestore(app).doc('system/email')
const current = (await ref.get()).data()

if (mode === 'status') {
	console.log(current ?? { mode: 'off (not set)', testRecipients: [] })
	await app.delete()
	process.exit(0)
}

let testRecipients = current?.testRecipients ?? []
if (mode === 'test') {
	const addresses = rest.filter((arg) => arg.includes('@'))
	if (addresses.length === 0) usage()
	testRecipients = addresses.map((address) => address.toLowerCase())
}
if (mode === 'live' && !rest.includes('--confirm-live')) {
	console.error(
		'Refusing: live sends email to every player. Re-run with --confirm-live.'
	)
	process.exit(1)
}

await ref.set({
	mode,
	testRecipients,
	updatedAt: FieldValue.serverTimestamp(),
})
console.log(`system/email.mode = ${mode}`, { testRecipients })
await app.delete()
