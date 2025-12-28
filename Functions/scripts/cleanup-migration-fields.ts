#!/usr/bin/env npx tsx
/**
 * Cleanup Migration Fields Script
 *
 * Removes migration metadata fields (legacyDocId, migratedAt) from
 * waiver documents in dropbox/{uid}/waivers subcollections.
 *
 * Uses a collection group query to find all waivers subcollections.
 *
 * Usage:
 *   npm run script:cleanup-migration --dry-run
 *   npm run script:cleanup-migration
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Fields to remove
const FIELDS_TO_REMOVE = ['legacyDocId', 'migratedAt']

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')

// Initialize Firebase Admin
function initializeFirebase(): void {
	if (process.env.FIRESTORE_EMULATOR_HOST) {
		console.log(
			`\n🔧 Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}\n`
		)
		initializeApp({ projectId: 'demo-project' })
		return
	}

	const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
	if (!credentialsPath) {
		console.error('\n❌ Error: GOOGLE_APPLICATION_CREDENTIALS not set')
		process.exit(1)
	}

	try {
		const serviceAccount = require(credentialsPath)
		initializeApp({ credential: cert(serviceAccount) })
		console.log(`\n🔑 Using service account: ${credentialsPath}\n`)
	} catch (_error) {
		console.error(`\n❌ Error loading credentials: ${credentialsPath}`)
		process.exit(1)
	}
}

async function cleanup(): Promise<void> {
	console.log('═'.repeat(60))
	console.log('  CLEANUP MIGRATION FIELDS')
	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log('\n⚠️  DRY RUN MODE - No changes will be made\n')
	}

	initializeFirebase()
	const firestore = getFirestore()

	// Use collection group query to find ALL waivers subcollection documents
	// This works even when parent documents don't exist
	console.log(
		'📂 Searching for waiver documents using collection group query...\n'
	)

	const waiversSnapshot = await firestore.collectionGroup('waivers').get()

	if (waiversSnapshot.empty) {
		console.log('\n✨ No waiver documents found.\n')
		return
	}

	console.log(`   Found ${waiversSnapshot.size} waiver document(s)\n`)

	let totalUpdated = 0
	let totalSkipped = 0

	for (const waiverDoc of waiversSnapshot.docs) {
		const data = waiverDoc.data()
		const hasFieldsToRemove = FIELDS_TO_REMOVE.some((field) => field in data)

		if (!hasFieldsToRemove) {
			totalSkipped++
			continue
		}

		if (isDryRun) {
			console.log(`  📝 Would clean: ${waiverDoc.ref.path}`)
			console.log(
				`      Fields to remove: ${FIELDS_TO_REMOVE.filter((f) => f in data).join(', ')}`
			)
			totalUpdated++
		} else {
			// Build update object to delete fields
			const updateData: Record<string, FieldValue> = {}
			for (const field of FIELDS_TO_REMOVE) {
				if (field in data) {
					updateData[field] = FieldValue.delete()
				}
			}

			await waiverDoc.ref.update(updateData)
			console.log(`  ✅ Cleaned: ${waiverDoc.ref.path}`)
			totalUpdated++
		}
	}

	console.log('\n' + '═'.repeat(60))
	console.log('  SUMMARY')
	console.log('═'.repeat(60))
	console.log(`  Documents updated: ${totalUpdated}`)
	console.log(`  Documents skipped: ${totalSkipped} (no migration fields)`)
	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log(
			'\n⚠️  This was a dry run. Run without --dry-run to apply changes.\n'
		)
	} else {
		console.log('\n✨ Cleanup complete!\n')
	}
}

cleanup().catch((error) => {
	console.error('\n❌ Cleanup failed:', error)
	process.exit(1)
})
