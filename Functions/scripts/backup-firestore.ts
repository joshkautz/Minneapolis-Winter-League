#!/usr/bin/env npx tsx
/**
 * Firestore Backup Script
 *
 * Creates a local JSON backup of Firestore collections.
 * Handles nested subcollections and preserves document references.
 *
 * Usage:
 *   # Backup all collections
 *   npm run script:backup
 *
 *   # Backup specific collections
 *   npm run script:backup -- --collections=waivers,players
 *
 *   # Backup to specific directory
 *   npm run script:backup -- --output=./my-backups
 *
 *   # Include subcollections (slower but complete)
 *   npm run script:backup -- --include-subcollections
 *
 * Prerequisites:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *
 * Output:
 *   Creates a timestamped directory with JSON files for each collection
 *   backup-YYYY-MM-DD-HH-mm-ss/
 *   ├── _metadata.json
 *   ├── players.json
 *   ├── teams.json
 *   ├── waivers.json
 *   └── ...
 */

import { initializeApp, cert } from 'firebase-admin/app'
import {
	getFirestore,
	Timestamp,
	DocumentReference,
	GeoPoint,
} from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Known top-level collections
const ALL_COLLECTIONS = [
	'badges',
	'customers',
	'dropbox',
	'games',
	'news',
	'offers',
	'players',
	'products',
	'rankings',
	'rankings-calculations',
	'rankings-history',
	'seasons',
	'siteSettings',
	'stripe',
	'teams',
	'waivers',
]

// Known subcollections by parent collection
const SUBCOLLECTIONS: Record<string, string[]> = {
	customers: ['checkout_sessions', 'payments', 'subscriptions'],
	dropbox: ['waivers'],
	players: [],
	products: ['prices', 'tax_rates'],
	stripe: ['checkouts', 'payments'],
	teams: ['badges', 'karma_transactions'],
}

// Parse command line arguments
function parseArgs(): {
	collections: string[]
	outputDir: string
	includeSubcollections: boolean
} {
	const args = process.argv.slice(2)
	let collections = ALL_COLLECTIONS
	let outputDir = './backups'
	let includeSubcollections = false

	for (const arg of args) {
		if (arg.startsWith('--collections=')) {
			collections = arg.replace('--collections=', '').split(',')
		} else if (arg.startsWith('--output=')) {
			outputDir = arg.replace('--output=', '')
		} else if (arg === '--include-subcollections') {
			includeSubcollections = true
		}
	}

	return { collections, outputDir, includeSubcollections }
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

// Convert Firestore types to JSON-serializable format
function serializeValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value
	}

	if (value instanceof Timestamp) {
		return {
			_type: 'timestamp',
			_seconds: value.seconds,
			_nanoseconds: value.nanoseconds,
		}
	}

	if (value instanceof DocumentReference) {
		return {
			_type: 'reference',
			_path: value.path,
		}
	}

	if (value instanceof GeoPoint) {
		return {
			_type: 'geopoint',
			_latitude: value.latitude,
			_longitude: value.longitude,
		}
	}

	if (Array.isArray(value)) {
		return value.map(serializeValue)
	}

	if (typeof value === 'object') {
		const serialized: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value)) {
			serialized[key] = serializeValue(val)
		}
		return serialized
	}

	return value
}

// Backup a single collection
async function backupCollection(
	firestore: FirebaseFirestore.Firestore,
	collectionPath: string,
	includeSubcollections: boolean
): Promise<{ documents: Record<string, unknown>[]; count: number }> {
	const documents: Record<string, unknown>[] = []
	const snapshot = await firestore.collection(collectionPath).get()

	for (const doc of snapshot.docs) {
		const docData: Record<string, unknown> = {
			_id: doc.id,
			_path: doc.ref.path,
			...(serializeValue(doc.data()) as Record<string, unknown>),
		}

		// Handle subcollections if requested
		if (includeSubcollections) {
			const collectionName = collectionPath.split('/').pop() || ''
			const subcollectionNames = SUBCOLLECTIONS[collectionName] || []

			for (const subcollectionName of subcollectionNames) {
				const subcollectionPath = `${doc.ref.path}/${subcollectionName}`
				const subcollectionResult = await backupCollection(
					firestore,
					subcollectionPath,
					false // Don't recurse deeper
				)

				if (subcollectionResult.count > 0) {
					docData[`_subcollection_${subcollectionName}`] =
						subcollectionResult.documents
				}
			}
		}

		documents.push(docData)
	}

	return { documents, count: snapshot.size }
}

// Main backup function
async function backup(): Promise<void> {
	const { collections, outputDir, includeSubcollections } = parseArgs()

	console.log('═'.repeat(60))
	console.log('  FIRESTORE BACKUP SCRIPT')
	console.log('═'.repeat(60))

	if (includeSubcollections) {
		console.log('\n📁 Including subcollections (this may take longer)\n')
	}

	// Initialize Firebase
	initializeFirebase()
	const firestore = getFirestore()

	// Create backup directory with timestamp
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const backupDir = path.join(outputDir, `backup-${timestamp}`)

	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true })
	}

	console.log(`📂 Backup directory: ${backupDir}\n`)

	// Track statistics
	const stats: Record<string, number> = {}
	let totalDocuments = 0

	// Backup each collection
	for (const collectionName of collections) {
		process.stdout.write(`  📖 Backing up ${collectionName}...`)

		try {
			const result = await backupCollection(
				firestore,
				collectionName,
				includeSubcollections
			)

			if (result.count > 0) {
				const filePath = path.join(backupDir, `${collectionName}.json`)
				fs.writeFileSync(filePath, JSON.stringify(result.documents, null, 2))
				stats[collectionName] = result.count
				totalDocuments += result.count
				console.log(` ✅ ${result.count} document(s)`)
			} else {
				console.log(' ⏭️  empty')
			}
		} catch (error) {
			console.log(` ❌ error`)
			console.error(`     ${error}`)
		}
	}

	// Write metadata file
	const metadata = {
		backupTimestamp: new Date().toISOString(),
		collections: stats,
		totalDocuments,
		includeSubcollections,
		firestoreEmulator: !!process.env.FIRESTORE_EMULATOR_HOST,
	}

	fs.writeFileSync(
		path.join(backupDir, '_metadata.json'),
		JSON.stringify(metadata, null, 2)
	)

	// Print summary
	console.log('\n' + '═'.repeat(60))
	console.log('  BACKUP SUMMARY')
	console.log('═'.repeat(60))
	console.log(`  Backup location: ${backupDir}`)
	console.log(`  Collections:     ${Object.keys(stats).length}`)
	console.log(`  Total documents: ${totalDocuments}`)
	console.log('═'.repeat(60))
	console.log('\n✨ Backup complete!\n')
}

// Run backup
backup().catch((error) => {
	console.error('\n❌ Backup failed:', error)
	process.exit(1)
})
