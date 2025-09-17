#!/usr/bin/env node

/**
 * Script to import production data into Firebase emulator
 *
 * This script imports JSON data exported by export-from-production.js
 * into running Firebase emulator instances.
 *
 * Imports:
 * - Firestore data (collections and subcollections)
 * - Authentication users (with password reset requirement)
 * - Storage files (uploaded to emulator storage bucket)
 *
 * Usage:
 * 1. Start Firebase emulators: firebase emulators:start
 * 2. Run this script: node scripts/production/import-to-emulator.js
 *
 * Options:
 * - Add --skip-auth to skip authentication import
 * - Add --skip-firestore to skip Firestore import
 * - Add --skip-storage to skip Storage import
 *
 * Note: This script can be run from any directory.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Parse command line arguments
const args = process.argv.slice(2)
const skipAuth = args.includes('--skip-auth')
const skipFirestore = args.includes('--skip-firestore')
const skipStorage = args.includes('--skip-storage')

// Configure emulator hosts before initializing Firebase
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199'

// Initialize Firebase Admin SDK for emulator
const app = initializeApp({
	projectId: 'minnesota-winter-league',
})

// Initialize services (they will automatically connect to emulators via environment variables)
const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)

const exportDir = path.join(__dirname, 'data')

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

async function importAuthentication() {
	if (skipAuth) {
		console.log('🔐 Skipping authentication import (--skip-auth flag)')
		return 0
	}

	const authDir = path.join(exportDir, 'auth_export')
	const accountsFile = path.join(authDir, 'accounts.json')

	if (!fs.existsSync(accountsFile)) {
		console.log('🔐 No authentication data found to import')
		return 0
	}

	console.log('🔐 Importing authentication users...')

	try {
		const authData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'))
		let importedUsers = 0

		for (const userData of authData.users) {
			try {
				// Create user in Auth emulator
				const userRecord = await auth.createUser({
					uid: userData.uid,
					email: userData.email,
					emailVerified: userData.emailVerified,
					displayName: userData.displayName,
					photoURL: userData.photoURL,
					phoneNumber: userData.phoneNumber,
					disabled: userData.disabled,
					// Note: Password cannot be imported for security reasons
					// Users will need to reset their passwords
				})

				// Set custom claims if they exist
				if (
					userData.customClaims &&
					Object.keys(userData.customClaims).length > 0
				) {
					await auth.setCustomUserClaims(userRecord.uid, userData.customClaims)
				}

				importedUsers++

				if (importedUsers % 50 === 0) {
					console.log(`   👤 Imported ${importedUsers} users...`)
				}
			} catch (userError) {
				if (userError.code === 'auth/uid-already-exists') {
					console.log(`   ⚠️  User ${userData.uid} already exists, skipping...`)
				} else {
					console.error(
						`   ❌ Error importing user ${userData.uid}:`,
						userError.message
					)
				}
			}
		}

		console.log(`   ✅ Successfully imported ${importedUsers} users`)
		console.log(
			`   ⚠️  NOTE: Users will need to reset passwords (cannot import password hashes)`
		)

		return importedUsers
	} catch (error) {
		console.error('❌ Error importing authentication data:', error)
		return 0
	}
}

/**
 * Import storage files to emulator
 */
async function importStorage() {
	console.log('📦 Importing Storage files...')

	const storageExportDir = path.join(exportDir, 'storage_export')
	const metadataFile = path.join(storageExportDir, 'metadata.json')

	try {
		// Check if storage export exists
		if (!fs.existsSync(storageExportDir)) {
			console.log('   ⚠️  No storage export found, skipping...')
			return 0
		}

		if (!fs.existsSync(metadataFile)) {
			console.log('   ⚠️  No storage metadata found, skipping...')
			return 0
		}

		const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
		const bucket = storage.bucket()
		let uploadedFiles = 0

		console.log(`   📁 Found ${metadata.files?.length || 0} files to import`)

		if (!metadata.files || metadata.files.length === 0) {
			console.log('   ✅ No files to import')
			return 0
		}

		// Upload each file
		for (const fileInfo of metadata.files) {
			try {
				const localFilePath = path.join(
					storageExportDir,
					'files',
					fileInfo.name
				)

				if (!fs.existsSync(localFilePath)) {
					console.log(`   ⚠️  File not found: ${fileInfo.name}`)
					continue
				}

				// Upload file to emulator storage
				const file = bucket.file(fileInfo.name)
				await file.save(fs.readFileSync(localFilePath), {
					metadata: {
						contentType: fileInfo.contentType,
						metadata: fileInfo.customMetadata,
					},
				})

				uploadedFiles++
				if (uploadedFiles % 10 === 0) {
					console.log(
						`   📤 Uploaded ${uploadedFiles}/${metadata.files.length} files...`
					)
				}
			} catch (fileError) {
				console.log(
					`   ⚠️  Failed to upload ${fileInfo.name}: ${fileError.message}`
				)
			}
		}

		console.log(`   ✅ Successfully imported ${uploadedFiles} storage files`)
		return uploadedFiles
	} catch (error) {
		console.error('❌ Error importing storage data:', error)
		return 0
	}
}

async function importAllData() {
	console.log('🚀 Starting comprehensive import to Firebase emulators...\n')
	console.log(`📂 Import directory: ${exportDir}\n`)

	const importStats = {
		firestore: { collections: 0, documents: 0 },
		auth: { users: 0 },
		storage: { files: 0 },
	}

	try {
		// Check if the export directory exists
		if (!fs.existsSync(exportDir)) {
			console.error(`❌ Export directory not found: ${exportDir}`)
			console.error(
				'Please run the export script first: node scripts/production/export-from-production.js'
			)
			process.exit(1)
		}

		// Import Authentication Data
		if (!skipAuth) {
			importStats.auth.users = await importAuthentication()
		} else {
			console.log('🔐 Skipping Authentication import (--skip-auth flag)')
		}

		// Import Firestore Data
		if (!skipFirestore) {
			console.log('\n🔥 Importing Firestore data...')

			const firestoreDir = path.join(exportDir, 'firestore_export')

			if (!fs.existsSync(firestoreDir)) {
				console.log(
					'⚠️  No Firestore export directory found, skipping Firestore import'
				)
			} else {
				// Clear existing Firestore data first
				await clearAllCollections()

				// Read all files in the export directory
				const files = fs.readdirSync(firestoreDir)

				// Separate main collections from subcollections
				const mainCollections = []
				const subcollections = []

				for (const file of files) {
					if (file.endsWith('.json')) {
						const fileName = file.replace('.json', '')

						if (fileName.includes('__')) {
							// This is a subcollection file
							subcollections.push(file)
						} else if (!fileName.includes('metadata')) {
							// This is a main collection file (exclude metadata files)
							mainCollections.push(file)
						}
					}
				}

				console.log(
					`   📋 Found ${mainCollections.length} main collections and ${subcollections.length} subcollection files\n`
				)

				let totalImported = 0

				// Import main collections first
				for (const file of mainCollections) {
					const collectionName = file.replace('.json', '')
					const filePath = path.join(firestoreDir, file)
					const imported = await importCollection(collectionName, filePath)
					totalImported += imported
					importStats.firestore.documents += imported
				}

				console.log('   📂 Importing subcollections...\n')

				// Import subcollections
				for (const file of subcollections) {
					const fileName = file.replace('.json', '')
					const parts = fileName.split('__')

					if (parts.length === 3) {
						const [parentCollection, parentDocId, subcollectionName] = parts
						const filePath = path.join(firestoreDir, file)
						const imported = await importSubcollection(
							parentCollection,
							parentDocId,
							subcollectionName,
							filePath
						)
						totalImported += imported
						importStats.firestore.documents += imported
					}
				}

				importStats.firestore.collections = mainCollections.length
				console.log(
					`   ✅ Firestore import completed: ${totalImported} documents`
				)
			}
		} else {
			console.log('🔥 Skipping Firestore import (--skip-firestore flag)')
		}

		// Import Storage Data
		if (!args.includes('--skip-storage')) {
			console.log('\n� Importing Storage data...')
			importStats.storage.files = await importStorage()
		} else {
			console.log('\n� Skipping Storage import (--skip-storage flag)')
		}

		console.log('\n🎉 Import completed successfully!')
		console.log('\n📊 Import Summary:')
		console.log(
			`   🔥 Firestore: ${importStats.firestore.collections} collections, ${importStats.firestore.documents} documents`
		)
		console.log(`   🔐 Authentication: ${importStats.auth.users} users`)
		console.log(`   📦 Storage: ${importStats.storage.files} files`)

		if (!skipAuth && importStats.auth.users > 0) {
			console.log('\n⚠️  IMPORTANT: Users will need to reset their passwords')
			console.log('   Password hashes cannot be imported for security reasons')
		}

		console.log('\n🌐 Emulator URLs:')
		console.log('   Firestore: http://127.0.0.1:4000/firestore')
		console.log('   Authentication: http://127.0.0.1:4000/auth')
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
