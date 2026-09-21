#!/usr/bin/env node

/**
 * Toggles the migration kill-switch at system/maintenance.migrationInProgress.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
 *     node scripts/migrations/2026-teams-v2/set-maintenance.js on
 *   node scripts/migrations/2026-teams-v2/set-maintenance.js off
 *
 * Against production, omit FIRESTORE_EMULATOR_HOST. The script uses ADC.
 */

// firebase-admin 14 removed the legacy default-export namespace, so the
// modular entry points are the only supported form.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const arg = process.argv[2]
if (arg !== 'on' && arg !== 'off') {
	console.error('Usage: set-maintenance.js [on|off]')
	process.exit(1)
}

const app = initializeApp({ projectId: 'minnesota-winter-league' })
const db = getFirestore(app)

await db.doc('system/maintenance').set(
	{
		migrationInProgress: arg === 'on',
		updatedAt: FieldValue.serverTimestamp(),
	},
	{ merge: true }
)

console.log(`✅ system/maintenance.migrationInProgress = ${arg === 'on'}`)
await app.delete()
