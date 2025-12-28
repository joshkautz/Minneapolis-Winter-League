#!/usr/bin/env npx tsx
/**
 * Waiver Migration Script
 *
 * Migrates waiver documents from the legacy flat collection to the new
 * per-user subcollection pattern:
 *
 * OLD: waivers/{waiverId}
 *   - player: DocumentReference
 *   - season: string
 *   - signatureRequestId: string
 *   - status: WaiverStatus
 *   - createdAt: Timestamp
 *   - signedAt?: Timestamp
 *
 * NEW: dropbox/{uid}/waivers/{waiverId}
 *   - seasonId: string
 *   - signatureRequestId: string
 *   - status: WaiverStatus
 *   - createdAt: Timestamp
 *   - signedAt?: Timestamp
 *
 * Usage:
 *   # Dry run (no changes made)
 *   npm run script:migrate-waivers -- --dry-run
 *
 *   # Production migration
 *   npm run script:migrate-waivers
 *
 *   # Delete old documents after migration (requires confirmation)
 *   npm run script:migrate-waivers -- --delete-old
 *
 * Prerequisites:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to your service account key
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *
 *   2. Or run with Firebase emulator:
 *      export FIRESTORE_EMULATOR_HOST="localhost:8080"
 */

import { initializeApp, cert } from 'firebase-admin/app'
import {
	getFirestore,
	Timestamp,
	DocumentReference,
} from 'firebase-admin/firestore'
import * as readline from 'readline'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Collection names
const LEGACY_COLLECTION = 'waivers'
const NEW_COLLECTION = 'dropbox'

// Types
interface LegacyWaiverDocument {
	player: DocumentReference
	season: string
	signatureRequestId: string
	status: 'pending' | 'signed' | 'declined' | 'canceled'
	createdAt: Timestamp
	signedAt?: Timestamp
}

interface NewWaiverDocument {
	seasonId: string
	signatureRequestId: string
	status: 'pending' | 'signed' | 'declined' | 'canceled'
	createdAt: Timestamp
	signedAt?: Timestamp
	migratedAt: Timestamp
	legacyDocId: string
}

interface MigrationStats {
	total: number
	migrated: number
	skipped: number
	errors: number
	deleted: number
}

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const shouldDeleteOld = args.includes('--delete-old')

// Initialize Firebase Admin
function initializeFirebase(): void {
	// Check if running against emulator
	if (process.env.FIRESTORE_EMULATOR_HOST) {
		console.log(
			`\n🔧 Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}\n`
		)
		initializeApp({ projectId: 'demo-project' })
		return
	}

	// Check for service account credentials
	const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
	if (!credentialsPath) {
		console.error('\n❌ Error: GOOGLE_APPLICATION_CREDENTIALS not set')
		console.error(
			'   Set this to the path of your Firebase service account key JSON file'
		)
		console.error(
			'   Example: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"\n'
		)
		process.exit(1)
	}

	try {
		const serviceAccount = require(credentialsPath)
		initializeApp({
			credential: cert(serviceAccount),
		})
		console.log(`\n🔑 Using service account: ${credentialsPath}\n`)
	} catch (error) {
		console.error(`\n❌ Error loading credentials: ${credentialsPath}`)
		console.error(error)
		process.exit(1)
	}
}

// Prompt for confirmation
async function confirm(message: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	return new Promise((resolve) => {
		rl.question(`${message} (yes/no): `, (answer) => {
			rl.close()
			resolve(answer.toLowerCase() === 'yes')
		})
	})
}

// Check if waiver already exists in new location
async function waiverExistsInNewLocation(
	firestore: FirebaseFirestore.Firestore,
	uid: string,
	signatureRequestId: string
): Promise<boolean> {
	const query = await firestore
		.collection(NEW_COLLECTION)
		.doc(uid)
		.collection('waivers')
		.where('signatureRequestId', '==', signatureRequestId)
		.limit(1)
		.get()

	return !query.empty
}

// Migrate a single waiver
async function migrateWaiver(
	firestore: FirebaseFirestore.Firestore,
	legacyDocId: string,
	legacyData: LegacyWaiverDocument,
	stats: MigrationStats,
	isDryRun: boolean
): Promise<void> {
	const uid = legacyData.player.id

	// Check if already migrated
	const exists = await waiverExistsInNewLocation(
		firestore,
		uid,
		legacyData.signatureRequestId
	)

	if (exists) {
		console.log(
			`  ⏭️  Skipping ${legacyDocId} - already exists for user ${uid}`
		)
		stats.skipped++
		return
	}

	// Create new document
	const newDoc: NewWaiverDocument = {
		seasonId: legacyData.season,
		signatureRequestId: legacyData.signatureRequestId,
		status: legacyData.status,
		createdAt: legacyData.createdAt,
		migratedAt: Timestamp.now(),
		legacyDocId: legacyDocId,
	}

	// Include signedAt if present
	if (legacyData.signedAt) {
		newDoc.signedAt = legacyData.signedAt
	}

	if (isDryRun) {
		console.log(`  📝 Would migrate ${legacyDocId} → dropbox/${uid}/waivers/`)
		console.log(`      Season: ${newDoc.seasonId}`)
		console.log(`      Status: ${newDoc.status}`)
		console.log(`      SignatureRequestId: ${newDoc.signatureRequestId}`)
	} else {
		await firestore
			.collection(NEW_COLLECTION)
			.doc(uid)
			.collection('waivers')
			.add(newDoc)
		console.log(`  ✅ Migrated ${legacyDocId} → dropbox/${uid}/waivers/`)
	}

	stats.migrated++
}

// Delete legacy documents
async function deleteLegacyDocuments(
	firestore: FirebaseFirestore.Firestore,
	docIds: string[],
	stats: MigrationStats,
	isDryRun: boolean
): Promise<void> {
	console.log(`\n🗑️  Deleting ${docIds.length} legacy documents...`)

	for (const docId of docIds) {
		if (isDryRun) {
			console.log(`  📝 Would delete waivers/${docId}`)
		} else {
			await firestore.collection(LEGACY_COLLECTION).doc(docId).delete()
			console.log(`  ✅ Deleted waivers/${docId}`)
		}
		stats.deleted++
	}
}

// Main migration function
async function migrate(): Promise<void> {
	console.log('═'.repeat(60))
	console.log('  WAIVER MIGRATION SCRIPT')
	console.log('  Legacy waivers → dropbox/{uid}/waivers subcollection')
	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log('\n⚠️  DRY RUN MODE - No changes will be made\n')
	}

	if (shouldDeleteOld) {
		console.log(
			'⚠️  DELETE MODE - Old documents will be deleted after migration\n'
		)
	}

	// Initialize Firebase
	initializeFirebase()
	const firestore = getFirestore()

	// Get all legacy waivers
	console.log(`📖 Reading from ${LEGACY_COLLECTION} collection...`)
	const legacySnapshot = await firestore.collection(LEGACY_COLLECTION).get()

	if (legacySnapshot.empty) {
		console.log('\n✨ No legacy waivers found. Nothing to migrate.\n')
		return
	}

	console.log(`   Found ${legacySnapshot.size} legacy waiver(s)\n`)

	// Confirm before proceeding
	if (!isDryRun) {
		const proceed = await confirm(
			`\nThis will migrate ${legacySnapshot.size} waiver(s) to the new format. Continue?`
		)
		if (!proceed) {
			console.log('\n❌ Migration cancelled.\n')
			return
		}
	}

	// Initialize stats
	const stats: MigrationStats = {
		total: legacySnapshot.size,
		migrated: 0,
		skipped: 0,
		errors: 0,
		deleted: 0,
	}

	// Track document IDs for potential deletion
	const migratedDocIds: string[] = []

	// Migrate each waiver
	console.log('\n📤 Migrating waivers...\n')

	for (const doc of legacySnapshot.docs) {
		try {
			const data = doc.data() as LegacyWaiverDocument

			// Validate required fields
			if (!data.player || !data.signatureRequestId) {
				console.log(`  ❌ Skipping ${doc.id} - missing required fields`)
				stats.errors++
				continue
			}

			await migrateWaiver(firestore, doc.id, data, stats, isDryRun)
			migratedDocIds.push(doc.id)
		} catch (error) {
			console.error(`  ❌ Error migrating ${doc.id}:`, error)
			stats.errors++
		}
	}

	// Delete old documents if requested
	if (shouldDeleteOld && migratedDocIds.length > 0) {
		if (!isDryRun) {
			const confirmDelete = await confirm(
				`\nDelete ${migratedDocIds.length} legacy document(s)?`
			)
			if (confirmDelete) {
				await deleteLegacyDocuments(firestore, migratedDocIds, stats, isDryRun)
			} else {
				console.log('\n⏭️  Skipped deletion of legacy documents')
			}
		} else {
			await deleteLegacyDocuments(firestore, migratedDocIds, stats, isDryRun)
		}
	}

	// Print summary
	console.log('\n' + '═'.repeat(60))
	console.log('  MIGRATION SUMMARY')
	console.log('═'.repeat(60))
	console.log(`  Total legacy waivers:  ${stats.total}`)
	console.log(`  Successfully migrated: ${stats.migrated}`)
	console.log(`  Skipped (duplicates):  ${stats.skipped}`)
	console.log(`  Errors:                ${stats.errors}`)
	if (shouldDeleteOld) {
		console.log(`  Deleted:               ${stats.deleted}`)
	}
	console.log('═'.repeat(60))

	if (isDryRun) {
		console.log(
			'\n⚠️  This was a dry run. Run without --dry-run to apply changes.\n'
		)
	} else if (stats.migrated > 0) {
		console.log('\n✨ Migration complete!\n')
		if (!shouldDeleteOld) {
			console.log(
				'💡 Tip: Run with --delete-old to remove legacy documents after verification.\n'
			)
		}
	}
}

// Run migration
migrate().catch((error) => {
	console.error('\n❌ Migration failed:', error)
	process.exit(1)
})
