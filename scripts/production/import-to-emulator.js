#!/usr/bin/env node

/**
 * Script to import production data into Firebase emulator
 *
 * This script imports JSON data exported by export-from-production.js
 * into a running Firestore emulator instance.
 *
 * Usage:
 * 1. Start Firebase emulators: firebase emulators:start --only firestore
 * 2. Run this script: node scripts/production/import-to-emulator.js
 *
 * Note: This script can be run from any directory.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize Firebase Admin SDK for emulator
const app = initializeApp({
	projectId: 'minnesota-winter-league',
})

// Configure Firestore to use emulator
const db = getFirestore(app)
db.settings({
	host: 'localhost:8080',
	ssl: false,
})

const exportDir = path.join(__dirname, 'data', 'firestore_export')

// Function to convert timestamp objects back to Firestore Timestamps
function convertTimestamps(obj) {
	if (obj === null || obj === undefined) return obj

	if (
		typeof obj === 'object' &&
		obj._seconds !== undefined &&
		obj._nanoseconds !== undefined
	) {
		// This is a Firestore Timestamp object
		return new Date(obj._seconds * 1000 + obj._nanoseconds / 1000000)
	}

	if (Array.isArray(obj)) {
		return obj.map(convertTimestamps)
	}

	if (typeof obj === 'object') {
		const converted = {}
		for (const [key, value] of Object.entries(obj)) {
			converted[key] = convertTimestamps(value)
		}
		return converted
	}

	return obj
}

// Function to import a collection
async function importCollection(collectionName, filePath) {
	console.log(`Importing collection: ${collectionName}`)

	try {
		const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
		const collection = db.collection(collectionName)

		let imported = 0
		let batch = db.batch()

		for (const [docId, docData] of Object.entries(data)) {
			const convertedData = convertTimestamps(docData)
			const docRef = collection.doc(docId)
			batch.set(docRef, convertedData)
			imported++

			// Commit batch every 500 documents
			if (imported % 500 === 0) {
				await batch.commit()
				console.log(`  Committed ${imported} documents to ${collectionName}`)
				batch = db.batch() // Create new batch
			}
		}

		// Commit any remaining documents
		if (imported % 500 !== 0) {
			await batch.commit()
		}

		console.log(`✅ Imported ${imported} documents to ${collectionName}`)
		return imported
	} catch (error) {
		console.error(`❌ Error importing ${collectionName}:`, error.message)
		return 0
	}
}

// Function to import subcollections
async function importSubcollection(
	parentCollection,
	parentDocId,
	subcollectionName,
	filePath
) {
	console.log(
		`Importing subcollection: ${parentCollection}/${parentDocId}/${subcollectionName}`
	)

	try {
		const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
		const subcollection = db
			.collection(parentCollection)
			.doc(parentDocId)
			.collection(subcollectionName)

		let imported = 0
		let batch = db.batch()

		for (const [docId, docData] of Object.entries(data)) {
			const convertedData = convertTimestamps(docData)
			const docRef = subcollection.doc(docId)
			batch.set(docRef, convertedData)
			imported++

			// Commit batch every 500 documents
			if (imported % 500 === 0) {
				await batch.commit()
				console.log(
					`  Committed ${imported} documents to ${parentCollection}/${parentDocId}/${subcollectionName}`
				)
				batch = db.batch() // Create new batch
			}
		}

		// Commit any remaining documents
		if (imported % 500 !== 0) {
			await batch.commit()
		}

		console.log(
			`✅ Imported ${imported} documents to ${parentCollection}/${parentDocId}/${subcollectionName}`
		)
		return imported
	} catch (error) {
		console.error(
			`❌ Error importing ${parentCollection}/${parentDocId}/${subcollectionName}:`,
			error.message
		)
		return 0
	}
}

// Function to clear all collections
async function clearAllCollections() {
	console.log('Clearing existing collections...\n')

	try {
		// Get all collections
		const collections = await db.listCollections()

		for (const collection of collections) {
			console.log(`Clearing collection: ${collection.id}`)

			// Get all documents in batches
			let batch = db.batch()
			let batchCount = 0

			const snapshot = await collection.get()
			for (const doc of snapshot.docs) {
				batch.delete(doc.ref)
				batchCount++

				// Commit batch every 500 deletions
				if (batchCount >= 500) {
					await batch.commit()
					batch = db.batch()
					batchCount = 0
				}
			}

			// Commit any remaining deletions
			if (batchCount > 0) {
				await batch.commit()
			}

			console.log(
				`✅ Cleared ${snapshot.docs.length} documents from ${collection.id}`
			)
		}

		console.log('✅ All collections cleared\n')
	} catch (error) {
		console.error('❌ Error clearing collections:', error.message)
		throw error
	}
}

async function importAllData() {
	console.log('Starting import to Firestore emulator...\n')
	console.log(`📂 Import directory: ${exportDir}\n`)

	try {
		// Check if the export directory exists
		if (!fs.existsSync(exportDir)) {
			console.error(`❌ Export directory not found: ${exportDir}`)
			console.error(
				'Please run the export script first: node scripts/production/export-from-production.js'
			)
			process.exit(1)
		}

		// Clear existing data first
		await clearAllCollections()

		// Read all files in the export directory
		const files = fs.readdirSync(exportDir)

		// Separate main collections from subcollections
		const mainCollections = []
		const subcollections = []

		for (const file of files) {
			if (file.endsWith('.json')) {
				const fileName = file.replace('.json', '')

				if (fileName.includes('__')) {
					// This is a subcollection file
					subcollections.push(file)
				} else {
					// This is a main collection file
					mainCollections.push(file)
				}
			}
		}

		console.log(
			`Found ${mainCollections.length} main collections and ${subcollections.length} subcollection files\n`
		)

		let totalImported = 0

		// Import main collections first
		for (const file of mainCollections) {
			const collectionName = file.replace('.json', '')
			const filePath = path.join(exportDir, file)
			const imported = await importCollection(collectionName, filePath)
			totalImported += imported
		}

		console.log('\nImporting subcollections...\n')

		// Import subcollections
		for (const file of subcollections) {
			const fileName = file.replace('.json', '')
			const parts = fileName.split('__')

			if (parts.length === 3) {
				const [parentCollection, parentDocId, subcollectionName] = parts
				const filePath = path.join(exportDir, file)
				const imported = await importSubcollection(
					parentCollection,
					parentDocId,
					subcollectionName,
					filePath
				)
				totalImported += imported
			}
		}

		console.log(
			`\n🎉 Import completed! Total documents imported: ${totalImported}`
		)
		console.log(
			'You can now view your data in the Firestore emulator UI at http://127.0.0.1:4000/firestore'
		)
	} catch (error) {
		console.error('❌ Import failed:', error)
		process.exit(1)
	}
}

// Run the import
importAllData()
	.then(() => {
		console.log('\n✅ Import script completed successfully')
		process.exit(0)
	})
	.catch((error) => {
		console.error('❌ Import script failed:', error)
		process.exit(1)
	})
