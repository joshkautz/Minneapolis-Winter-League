#!/usr/bin/env node

/**
 * Script to export production data for emulator import
 *
 * This script creates JSON files that can be easily imported into the emulator
 * using the import-to-emulator.js script.
 *
 * Usage:
 * 1. Run this script: node scripts/production/export-from-production.js
 * 2. Import data: node scripts/production/import-to-emulator.js
 *
 * Note: This script can be run from any directory.
 */

import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize production Firebase app
const app = admin.initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = app.firestore()

async function exportCollection(collectionName, outputDir) {
	console.log(`📁 Exporting collection: ${collectionName}`)

	try {
		const snapshot = await db.collection(collectionName).get()

		if (snapshot.empty) {
			console.log(`   ⚠️  Collection ${collectionName} is empty`)
			return
		}

		const collectionData = {}

		for (const doc of snapshot.docs) {
			const docData = doc.data()

			// Convert Firestore timestamps to ISO strings for JSON compatibility
			const convertedData = convertTimestamps(docData)

			collectionData[doc.id] = convertedData

			// Export subcollections
			await exportSubcollections(collectionName, doc.id, outputDir)
		}

		// Write collection data to file
		const collectionFile = path.join(outputDir, `${collectionName}.json`)
		fs.writeFileSync(collectionFile, JSON.stringify(collectionData, null, 2))

		console.log(
			`   ✅ Exported ${snapshot.size} documents to ${collectionFile}`
		)
	} catch (error) {
		console.error(`   ❌ Error exporting collection ${collectionName}:`, error)
	}
}

async function exportSubcollections(parentPath, docId, outputDir) {
	try {
		const docRef = db.collection(parentPath).doc(docId)
		const subcollections = await docRef.listCollections()

		for (const subcollection of subcollections) {
			const subPath = `${parentPath}__${docId}__${subcollection.id}`
			console.log(`   📂 Found subcollection: ${subPath}`)

			const subSnapshot = await subcollection.get()

			if (!subSnapshot.empty) {
				const subcollectionData = {}

				for (const subDoc of subSnapshot.docs) {
					const subDocData = subDoc.data()
					const convertedData = convertTimestamps(subDocData)
					subcollectionData[subDoc.id] = convertedData

					// Recursively export deeper subcollections
					await exportSubcollections(
						`${parentPath}/${docId}/${subcollection.id}`,
						subDoc.id,
						outputDir
					)
				}

				const subcollectionFile = path.join(outputDir, `${subPath}.json`)
				fs.writeFileSync(
					subcollectionFile,
					JSON.stringify(subcollectionData, null, 2)
				)

				console.log(
					`      ✅ Exported ${subSnapshot.size} documents to ${subcollectionFile}`
				)
			}
		}
	} catch (error) {
		console.error(
			`   ❌ Error exporting subcollections for ${parentPath}/${docId}:`,
			error
		)
	}
}

function convertTimestamps(obj, visited = new Set()) {
	if (obj === null || obj === undefined) {
		return obj
	}

	// Prevent circular references
	if (typeof obj === 'object' && visited.has(obj)) {
		return '[Circular Reference]'
	}

	if (typeof obj === 'object') {
		visited.add(obj)
	}

	// Handle Firestore Timestamp objects
	if (obj._seconds && obj._nanoseconds) {
		return new Date(
			obj._seconds * 1000 + obj._nanoseconds / 1000000
		).toISOString()
	}

	if (obj.constructor && obj.constructor.name === 'Timestamp') {
		return obj.toDate().toISOString()
	}

	// Handle DocumentReference objects
	if (obj.constructor && obj.constructor.name === 'DocumentReference') {
		return obj.path
	}

	// Handle other Firestore types
	if (
		obj.constructor &&
		(obj.constructor.name === 'GeoPoint' ||
			obj.constructor.name === 'FieldValue' ||
			obj.constructor.name === 'FieldPath')
	) {
		return obj.toString()
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => convertTimestamps(item, visited))
	}

	if (typeof obj === 'object' && obj.constructor === Object) {
		const converted = {}
		for (const [key, value] of Object.entries(obj)) {
			converted[key] = convertTimestamps(value, visited)
		}
		return converted
	}

	return obj
}

async function getAllCollections() {
	try {
		const collections = await db.listCollections()
		return collections.map((col) => col.id)
	} catch (error) {
		console.error('❌ Error listing collections:', error)
		return []
	}
}

async function createEmulatorImportStructure(outputDir) {
	// Create the directory structure expected by firebase emulators:import
	const firestoreDir = path.join(outputDir, 'firestore_export')

	if (!fs.existsSync(firestoreDir)) {
		fs.mkdirSync(firestoreDir, { recursive: true })
	}

	return firestoreDir
}

async function main() {
	console.log('🚀 Starting production data export for emulator import...\n')

	// Use absolute path relative to the production scripts directory
	const outputDir = path.join(__dirname, 'data')
	console.log(`📂 Export directory: ${outputDir}\n`)

	// Create output directory
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true })
	}

	const firestoreDir = await createEmulatorImportStructure(outputDir)

	const collections = await getAllCollections()

	if (collections.length === 0) {
		console.log('⚠️  No collections found in production database')
		return
	}

	console.log(
		`📋 Found ${collections.length} collections:`,
		collections.join(', ')
	)

	for (const collectionName of collections) {
		await exportCollection(collectionName, firestoreDir)
	}

	// Create metadata file for emulator import
	const metadata = {
		version: '1.0.0',
		timestamp: new Date().toISOString(),
		collections: collections,
	}

	fs.writeFileSync(
		path.join(outputDir, 'metadata.json'),
		JSON.stringify(metadata, null, 2)
	)

	console.log('\n🎉 Data export completed successfully!')
	console.log(`📂 Data exported to: ${outputDir}`)
	console.log('\n💡 To use this data with the emulator:')
	console.log(
		`   firebase emulators:start --import ${path.relative(process.cwd(), outputDir)}`
	)
}

// Handle cleanup
process.on('SIGINT', () => {
	console.log('\n\n⏹️  Process interrupted. Cleaning up...')
	app.delete()
	process.exit(0)
})

process.on('unhandledRejection', (error) => {
	console.error('❌ Unhandled rejection:', error)
	app.delete()
	process.exit(1)
})

// Run the script
main().catch((error) => {
	console.error('❌ Script failed:', error)
	app.delete()
	process.exit(1)
})
