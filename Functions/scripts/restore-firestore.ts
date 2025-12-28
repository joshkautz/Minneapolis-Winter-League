#!/usr/bin/env npx tsx
/**
 * Firestore Restore Script
 *
 * Restores Firestore data from a backup created by backup-firestore.ts.
 * Handles special types (Timestamps, DocumentReferences, GeoPoints).
 *
 * Usage:
 *   # Dry run - see what would be restored without making changes
 *   npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --dry-run
 *
 *   # Restore all collections from backup
 *   npm run script:restore -- ./backups/backup-2024-01-15-10-30-00
 *
 *   # Restore specific collections only
 *   npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --collections=waivers,players
 *
 *   # Overwrite existing documents (default is to skip existing)
 *   npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --overwrite
 *
 *   # Delete all existing documents before restore (DANGEROUS)
 *   npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --clear-first
 *
 * Prerequisites:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *
 * CAUTION: This script modifies production data. Always test with --dry-run first.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import {
	getFirestore,
	Timestamp,
	GeoPoint,
	WriteBatch,
} from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Parse command line arguments
function parseArgs(): {
	backupDir: string
	collections: string[] | null
	dryRun: boolean
	overwrite: boolean
	clearFirst: boolean
} {
	const args = process.argv.slice(2)
	let backupDir = ''
	let collections: string[] | null = null
	let dryRun = false
	let overwrite = false
	let clearFirst = false

	for (const arg of args) {
		if (arg.startsWith('--collections=')) {
			collections = arg.replace('--collections=', '').split(',')
		} else if (arg === '--dry-run') {
			dryRun = true
		} else if (arg === '--overwrite') {
			overwrite = true
		} else if (arg === '--clear-first') {
			clearFirst = true
		} else if (!arg.startsWith('--')) {
			backupDir = arg
		}
	}

	if (!backupDir) {
		console.error('\n❌ Error: Backup directory path required')
		console.error(
			'   Usage: npx ts-node scripts/restore-firestore.ts <backup-dir> [options]'
		)
		console.error('\n   Options:')
		console.error(
			'     --dry-run              Preview changes without modifying data'
		)
		console.error(
			'     --collections=a,b,c    Restore only specific collections'
		)
		console.error('     --overwrite            Overwrite existing documents')
		console.error(
			'     --clear-first          Delete all docs before restore (DANGEROUS)\n'
		)
		process.exit(1)
	}

	return { backupDir, collections, dryRun, overwrite, clearFirst }
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
		console.error(
			'   Set this to the path of your Firebase service account key JSON file'
		)
		process.exit(1)
	}

	try {
		const serviceAccount = require(credentialsPath)
		initializeApp({ credential: cert(serviceAccount) })
		console.log(`\n🔑 Using service account: ${credentialsPath}\n`)
	} catch (error) {
		console.error(`\n❌ Error loading credentials: ${credentialsPath}`)
		console.error(error)
		process.exit(1)
	}
}

// Convert serialized values back to Firestore types
function deserializeValue(
	firestore: FirebaseFirestore.Firestore,
	value: unknown
): unknown {
	if (value === null || value === undefined) {
		return value
	}

	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>

		// Handle special types
		if (obj._type === 'timestamp') {
			return new Timestamp(obj._seconds as number, obj._nanoseconds as number)
		}

		if (obj._type === 'reference') {
			return firestore.doc(obj._path as string)
		}

		if (obj._type === 'geopoint') {
			return new GeoPoint(obj._latitude as number, obj._longitude as number)
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return value.map((v) => deserializeValue(firestore, v))
		}

		// Handle nested objects
		const deserialized: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(obj)) {
			// Skip metadata fields
			if (key.startsWith('_')) continue
			deserialized[key] = deserializeValue(firestore, val)
		}
		return deserialized
	}

	return value
}

// Delete all documents in a collection
async function clearCollection(
	firestore: FirebaseFirestore.Firestore,
	collectionName: string,
	dryRun: boolean
): Promise<number> {
	const snapshot = await firestore.collection(collectionName).get()
	let deleted = 0

	if (dryRun) {
		return snapshot.size
	}

	// Delete in batches of 500 (Firestore limit)
	const batchSize = 500
	const batches: WriteBatch[] = []
	let currentBatch = firestore.batch()
	let operationCount = 0

	for (const doc of snapshot.docs) {
		currentBatch.delete(doc.ref)
		operationCount++
		deleted++

		if (operationCount >= batchSize) {
			batches.push(currentBatch)
			currentBatch = firestore.batch()
			operationCount = 0
		}
	}

	if (operationCount > 0) {
		batches.push(currentBatch)
	}

	// Execute all batches
	for (const batch of batches) {
		await batch.commit()
	}

	return deleted
}

// Restore a single collection
async function restoreCollection(
	firestore: FirebaseFirestore.Firestore,
	collectionName: string,
	documents: Record<string, unknown>[],
	options: { dryRun: boolean; overwrite: boolean }
): Promise<{ restored: number; skipped: number; errors: number }> {
	const stats = { restored: 0, skipped: 0, errors: 0 }

	// Process in batches of 500
	const batchSize = 500
	let currentBatch = firestore.batch()
	let operationCount = 0

	for (const doc of documents) {
		try {
			const _docId = doc._id as string // Used for logging if needed
			const docPath = doc._path as string
			void _docId // Suppress unused variable warning

			// Deserialize the document data
			const data = deserializeValue(firestore, doc) as Record<string, unknown>

			// Check if document exists
			const docRef = firestore.doc(docPath)

			if (!options.dryRun) {
				const existing = await docRef.get()

				if (existing.exists && !options.overwrite) {
					stats.skipped++
					continue
				}

				currentBatch.set(docRef, data)
				operationCount++

				if (operationCount >= batchSize) {
					await currentBatch.commit()
					currentBatch = firestore.batch()
					operationCount = 0
				}
			}

			stats.restored++

			// Handle subcollections
			for (const [key, value] of Object.entries(doc)) {
				if (key.startsWith('_subcollection_') && Array.isArray(value)) {
					const _subcollectionName = key.replace('_subcollection_', '')
					void _subcollectionName // Suppress unused variable warning
					const subcollectionDocs = value as Record<string, unknown>[]

					for (const subDoc of subcollectionDocs) {
						const subDocPath = subDoc._path as string
						const subData = deserializeValue(firestore, subDoc) as Record<
							string,
							unknown
						>

						if (!options.dryRun) {
							const subDocRef = firestore.doc(subDocPath)
							const subExisting = await subDocRef.get()

							if (!subExisting.exists || options.overwrite) {
								currentBatch.set(subDocRef, subData)
								operationCount++

								if (operationCount >= batchSize) {
									await currentBatch.commit()
									currentBatch = firestore.batch()
									operationCount = 0
								}
							}
						}
					}
				}
			}
		} catch (error) {
			console.error(`     ❌ Error restoring document: ${error}`)
			stats.errors++
		}
	}

	// Commit remaining operations
	if (!options.dryRun && operationCount > 0) {
		await currentBatch.commit()
	}

	return stats
}

// Main restore function
async function restore(): Promise<void> {
	const { backupDir, collections, dryRun, overwrite, clearFirst } = parseArgs()

	console.log('═'.repeat(60))
	console.log('  FIRESTORE RESTORE SCRIPT')
	console.log('═'.repeat(60))

	if (dryRun) {
		console.log('\n⚠️  DRY RUN MODE - No changes will be made\n')
	}

	if (clearFirst) {
		console.log('⚠️  CLEAR MODE - Existing documents will be DELETED first\n')
	}

	if (overwrite) {
		console.log('⚠️  OVERWRITE MODE - Existing documents will be overwritten\n')
	}

	// Verify backup directory exists
	if (!fs.existsSync(backupDir)) {
		console.error(`\n❌ Backup directory not found: ${backupDir}\n`)
		process.exit(1)
	}

	// Read metadata
	const metadataPath = path.join(backupDir, '_metadata.json')
	let metadata: Record<string, unknown> = {}

	if (fs.existsSync(metadataPath)) {
		metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
		console.log(`📅 Backup timestamp: ${metadata.backupTimestamp}`)
		console.log(`📊 Total documents in backup: ${metadata.totalDocuments}\n`)
	}

	// Get list of backup files
	const files = fs.readdirSync(backupDir).filter((f) => {
		if (f === '_metadata.json') return false
		if (!f.endsWith('.json')) return false
		if (collections) {
			const collectionName = f.replace('.json', '')
			return collections.includes(collectionName)
		}
		return true
	})

	if (files.length === 0) {
		console.log('\n⚠️  No backup files found to restore.\n')
		return
	}

	console.log(`📂 Backup directory: ${backupDir}`)
	console.log(
		`📁 Collections to restore: ${files.map((f) => f.replace('.json', '')).join(', ')}\n`
	)

	// Initialize Firebase
	initializeFirebase()
	const firestore = getFirestore()

	// Confirm before proceeding
	if (!dryRun) {
		const message = clearFirst
			? `\n⚠️  This will DELETE existing data and restore ${files.length} collection(s). Continue?`
			: `\nThis will restore ${files.length} collection(s). Continue?`

		const proceed = await confirm(message)
		if (!proceed) {
			console.log('\n❌ Restore cancelled.\n')
			return
		}
	}

	// Track statistics
	const totalStats = { restored: 0, skipped: 0, errors: 0, cleared: 0 }

	// Restore each collection
	for (const file of files) {
		const collectionName = file.replace('.json', '')
		process.stdout.write(`  📤 Restoring ${collectionName}...`)

		try {
			// Clear existing documents if requested
			if (clearFirst) {
				const cleared = await clearCollection(firestore, collectionName, dryRun)
				totalStats.cleared += cleared
				if (cleared > 0) {
					process.stdout.write(` (cleared ${cleared})`)
				}
			}

			// Read backup file
			const filePath = path.join(backupDir, file)
			const documents = JSON.parse(
				fs.readFileSync(filePath, 'utf-8')
			) as Record<string, unknown>[]

			// Restore documents
			const stats = await restoreCollection(
				firestore,
				collectionName,
				documents,
				{
					dryRun,
					overwrite,
				}
			)

			totalStats.restored += stats.restored
			totalStats.skipped += stats.skipped
			totalStats.errors += stats.errors

			console.log(
				` ✅ ${stats.restored} restored, ${stats.skipped} skipped, ${stats.errors} errors`
			)
		} catch (error) {
			console.log(` ❌ error`)
			console.error(`     ${error}`)
			totalStats.errors++
		}
	}

	// Print summary
	console.log('\n' + '═'.repeat(60))
	console.log('  RESTORE SUMMARY')
	console.log('═'.repeat(60))
	console.log(`  Documents restored: ${totalStats.restored}`)
	console.log(`  Documents skipped:  ${totalStats.skipped}`)
	console.log(`  Errors:             ${totalStats.errors}`)
	if (clearFirst) {
		console.log(`  Documents cleared:  ${totalStats.cleared}`)
	}
	console.log('═'.repeat(60))

	if (dryRun) {
		console.log(
			'\n⚠️  This was a dry run. Run without --dry-run to apply changes.\n'
		)
	} else if (totalStats.restored > 0) {
		console.log('\n✨ Restore complete!\n')
	}
}

// Run restore
restore().catch((error) => {
	console.error('\n❌ Restore failed:', error)
	process.exit(1)
})
