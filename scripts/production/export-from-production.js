#!/usr/bin/env node

/**
 * Script to export production data for emulator import
 *
 * This script exports:
 * - Firestore data (collections and subcollections)
 * - Authentication users
 * - Storage files (optional - can be large)
 *
 * Usage:
 * 1. Run this script: node scripts/production/export-from-production.js
 * 2. Import data: node scripts/production/import-to-emulator.js
 *
 * Options:
 * - Add --skip-storage to skip storage export (faster)
 * - Add --skip-auth to skip authentication export
 * - Add --skip-firestore to skip Firestore export
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

// Parse command line arguments
const args = process.argv.slice(2)
const skipStorage = args.includes('--skip-storage')
const skipAuth = args.includes('--skip-auth')
const skipFirestore = args.includes('--skip-firestore')

// Initialize production Firebase app
const app = admin.initializeApp({
	projectId: 'minnesota-winter-league',
	storageBucket: 'minnesota-winter-league.appspot.com',
})

const db = app.firestore()
const auth = admin.auth()
const storage = admin.storage()

async function exportAuthentication(outputDir) {
	if (skipAuth) {
		console.log('🔐 Skipping authentication export (--skip-auth flag)')
		return
	}

	console.log('🔐 Exporting authentication users...')

	try {
		const authDir = path.join(outputDir, 'auth_export')
		if (!fs.existsSync(authDir)) {
			fs.mkdirSync(authDir, { recursive: true })
		}

		const users = []
		let nextPageToken
		let totalUsers = 0

		do {
			const listUsersResult = await auth.listUsers(1000, nextPageToken)

			for (const userRecord of listUsersResult.users) {
				const userData = {
					uid: userRecord.uid,
					email: userRecord.email,
					emailVerified: userRecord.emailVerified,
					displayName: userRecord.displayName,
					photoURL: userRecord.photoURL,
					phoneNumber: userRecord.phoneNumber,
					disabled: userRecord.disabled,
					metadata: {
						lastSignInTime: userRecord.metadata.lastSignInTime,
						creationTime: userRecord.metadata.creationTime,
						lastRefreshTime: userRecord.metadata.lastRefreshTime,
					},
					customClaims: userRecord.customClaims || {},
					providerData: userRecord.providerData.map((provider) => ({
						uid: provider.uid,
						displayName: provider.displayName,
						email: provider.email,
						phoneNumber: provider.phoneNumber,
						photoURL: provider.photoURL,
						providerId: provider.providerId,
					})),
				}

				// Note: Password hashes are not exportable for security reasons
				users.push(userData)
				totalUsers++
			}

			nextPageToken = listUsersResult.pageToken
		} while (nextPageToken)

		// Write users data to file
		const usersFile = path.join(authDir, 'accounts.json')
		fs.writeFileSync(
			usersFile,
			JSON.stringify(
				{
					version: 2,
					users: users,
				},
				null,
				2
			)
		)

		console.log(`   ✅ Exported ${totalUsers} users to ${usersFile}`)

		// Create metadata for auth export
		const authMetadata = {
			version: '2.0.0',
			timestamp: new Date().toISOString(),
			userCount: totalUsers,
			note: 'Password hashes are not included for security reasons. Users will need to reset passwords.',
		}

		fs.writeFileSync(
			path.join(authDir, 'metadata.json'),
			JSON.stringify(authMetadata, null, 2)
		)

		return totalUsers
	} catch (error) {
		console.error('   ❌ Error exporting authentication data:', error)
		return 0
	}
}

async function exportStorage(outputDir) {
	if (skipStorage) {
		console.log('📁 Skipping storage export (--skip-storage flag)')
		return
	}

	console.log('📁 Exporting storage files...')

	try {
		const storageDir = path.join(outputDir, 'storage_export')
		if (!fs.existsSync(storageDir)) {
			fs.mkdirSync(storageDir, { recursive: true })
		}

		// Try to get the default bucket, with fallback options
		let bucket
		try {
			bucket = storage.bucket() // Uses default bucket from initialization
		} catch (bucketError) {
			// Try common bucket naming patterns
			const possibleBuckets = [
				'minnesota-winter-league.appspot.com',
				'minnesota-winter-league.firebasestorage.app',
				'minnesota-winter-league',
			]

			for (const bucketName of possibleBuckets) {
				try {
					bucket = storage.bucket(bucketName)
					const [exists] = await bucket.exists()
					if (exists) {
						console.log(`   📦 Using bucket: ${bucketName}`)
						break
					}
				} catch (e) {
					// Continue to next bucket name
				}
			}

			if (!bucket) {
				throw new Error(
					'No accessible storage bucket found. You may need to configure Firebase Storage or run with --skip-storage'
				)
			}
		}

		const [files] = await bucket.getFiles()

		let totalFiles = 0
		let totalSize = 0
		const fileList = []

		if (files.length === 0) {
			console.log('   📦 No files found in storage bucket')
			return 0
		}

		for (const file of files) {
			try {
				const [metadata] = await file.getMetadata()
				const fileInfo = {
					name: file.name,
					bucket: file.bucket.name,
					generation: metadata.generation,
					contentType: metadata.contentType,
					size: parseInt(metadata.size),
					timeCreated: metadata.timeCreated,
					updated: metadata.updated,
					md5Hash: metadata.md5Hash,
					crc32c: metadata.crc32c,
				}

				fileList.push(fileInfo)
				totalSize += fileInfo.size

				// Download file (be careful with large files)
				const filePath = path.join(storageDir, file.name.replace(/\//g, '_'))
				await file.download({ destination: filePath })

				totalFiles++

				if (totalFiles % 10 === 0) {
					console.log(`   📄 Downloaded ${totalFiles} files...`)
				}
			} catch (fileError) {
				console.warn(
					`   ⚠️  Could not download ${file.name}:`,
					fileError.message
				)
			}
		}

		// Write storage metadata
		const storageMetadata = {
			version: '1.0.0',
			timestamp: new Date().toISOString(),
			bucket: bucket.name,
			fileCount: totalFiles,
			totalSize: totalSize,
			files: fileList,
		}

		fs.writeFileSync(
			path.join(storageDir, 'metadata.json'),
			JSON.stringify(storageMetadata, null, 2)
		)

		console.log(
			`   ✅ Exported ${totalFiles} files (${(totalSize / 1024 / 1024).toFixed(2)} MB) to ${storageDir}`
		)
		return totalFiles
	} catch (error) {
		console.error('   ❌ Error exporting storage data:', error.message)
		console.log(
			"   💡 Tip: Run with --skip-storage if you don't need storage files"
		)
		return 0
	}
}

async function exportCollection(collectionName, outputDir) {
	console.log(`📁 Exporting collection: ${collectionName}`)

	try {
		// Use listDocuments() instead of .get() so we also discover "phantom"
		// parent documents that have no fields but contain subcollections
		// (e.g. dropbox/{uid} with only a waivers subcollection). These would
		// be invisible to .get() and a normal listCollections() walk.
		const docRefs = await db.collection(collectionName).listDocuments()

		if (docRefs.length === 0) {
			console.log(`   ⚠️  Collection ${collectionName} is empty`)
			return 0
		}

		const collectionData = {}
		let realDocCount = 0

		for (const docRef of docRefs) {
			const snapshot = await docRef.get()
			if (snapshot.exists) {
				collectionData[docRef.id] = convertTimestamps(snapshot.data())
				realDocCount++
			}
			// Always recurse — phantom parents still have subcollections worth exporting.
			await exportSubcollections(collectionName, docRef.id, outputDir)
		}

		// Only write the collection JSON if there were real (non-phantom) docs.
		if (realDocCount > 0) {
			const collectionFile = path.join(outputDir, `${collectionName}.json`)
			fs.writeFileSync(collectionFile, JSON.stringify(collectionData, null, 2))
			console.log(
				`   ✅ Exported ${realDocCount} documents to ${collectionFile}`
			)
		} else {
			console.log(
				`   ✅ Exported ${docRefs.length} phantom parent(s) (subcollections only)`
			)
		}

		return realDocCount
	} catch (error) {
		console.error(`   ❌ Error exporting collection ${collectionName}:`, error)
		return 0
	}
}

async function exportSubcollections(parentPath, docId, outputDir) {
	try {
		const docRef = db.collection(parentPath).doc(docId)
		const subcollections = await docRef.listCollections()

		for (const subcollection of subcollections) {
			const subPath = `${parentPath}__${docId}__${subcollection.id}`
			console.log(`   📂 Found subcollection: ${subPath}`)

			// listDocuments() also surfaces phantom-parent subdocs.
			const subDocRefs = await subcollection.listDocuments()

			if (subDocRefs.length === 0) continue

			const subcollectionData = {}
			let realDocCount = 0

			for (const subDocRef of subDocRefs) {
				const subSnap = await subDocRef.get()
				if (subSnap.exists) {
					subcollectionData[subDocRef.id] = convertTimestamps(subSnap.data())
					realDocCount++
				}
				// Recurse into deeper subcollections.
				await exportSubcollections(
					`${parentPath}/${docId}/${subcollection.id}`,
					subDocRef.id,
					outputDir
				)
			}

			if (realDocCount > 0) {
				const subcollectionFile = path.join(outputDir, `${subPath}.json`)
				fs.writeFileSync(
					subcollectionFile,
					JSON.stringify(subcollectionData, null, 2)
				)
				console.log(
					`      ✅ Exported ${realDocCount} documents to ${subcollectionFile}`
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

// Top-level collections whose parent docs are entirely phantom (only contain
// subcollections). db.listCollections() does NOT return these, so we have to
// know them ahead of time and merge them in.
const KNOWN_PHANTOM_PARENT_COLLECTIONS = ['dropbox']

async function getAllCollections() {
	try {
		const collections = await db.listCollections()
		const ids = new Set(collections.map((col) => col.id))
		for (const id of KNOWN_PHANTOM_PARENT_COLLECTIONS) {
			ids.add(id)
		}
		return Array.from(ids).sort()
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
	console.log(
		'🚀 Starting comprehensive production data export for emulator import...\n'
	)

	// Use absolute path relative to the production scripts directory
	const outputDir = path.join(__dirname, 'data')
	console.log(`📂 Export directory: ${outputDir}\n`)

	// Create output directory
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true })
	}

	const exportStats = {
		firestore: { collections: 0, documents: 0 },
		auth: { users: 0 },
		storage: { files: 0 },
	}

	// Export Authentication Data
	const authUsers = await exportAuthentication(outputDir)
	exportStats.auth.users = authUsers || 0

	// Export Storage Data
	const storageFiles = await exportStorage(outputDir)
	exportStats.storage.files = storageFiles || 0

	// Export Firestore Data
	if (!skipFirestore) {
		const firestoreDir = await createEmulatorImportStructure(outputDir)
		const collections = await getAllCollections()

		if (collections.length === 0) {
			console.log('⚠️  No collections found in production database')
		} else {
			console.log('🔥 Exporting Firestore data...')
			console.log(
				`📋 Found ${collections.length} collections:`,
				collections.join(', ')
			)

			let totalDocuments = 0
			for (const collectionName of collections) {
				const docCount = await exportCollection(collectionName, firestoreDir)
				totalDocuments += docCount || 0
			}

			exportStats.firestore.collections = collections.length
			exportStats.firestore.documents = totalDocuments

			// Create metadata file for Firestore export
			const firestoreMetadata = {
				version: '1.0.0',
				timestamp: new Date().toISOString(),
				collections: collections,
				totalDocuments: totalDocuments,
			}

			fs.writeFileSync(
				path.join(outputDir, 'firestore_metadata.json'),
				JSON.stringify(firestoreMetadata, null, 2)
			)
		}
	} else {
		console.log('🔥 Skipping Firestore export (--skip-firestore flag)')
	}

	// Create overall metadata file
	const overallMetadata = {
		version: '1.0.0',
		timestamp: new Date().toISOString(),
		exportStats: exportStats,
		services: {
			firestore: !skipFirestore,
			auth: !skipAuth,
			storage: !skipStorage,
		},
	}

	fs.writeFileSync(
		path.join(outputDir, 'export_metadata.json'),
		JSON.stringify(overallMetadata, null, 2)
	)

	console.log('\n🎉 Data export completed successfully!')
	console.log(`📂 Data exported to: ${outputDir}`)
	console.log('\n📊 Export Summary:')
	console.log(
		`   🔥 Firestore: ${exportStats.firestore.collections} collections, ${exportStats.firestore.documents} documents`
	)
	console.log(`   🔐 Authentication: ${exportStats.auth.users} users`)
	console.log(`   📁 Storage: ${exportStats.storage.files} files`)

	console.log('\n💡 To use this data with the emulator:')
	if (!skipFirestore) {
		console.log(
			`   firebase emulators:start --import ${path.relative(process.cwd(), outputDir)}`
		)
	}
	if (!skipAuth) {
		console.log(
			`   # Auth data will be imported automatically when starting emulators`
		)
	}
	if (!skipStorage) {
		console.log(
			`   # Storage files available in: ${path.join(outputDir, 'storage_export')}`
		)
	}
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
