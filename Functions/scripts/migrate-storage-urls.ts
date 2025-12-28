#!/usr/bin/env npx tsx
/**
 * Storage URL Migration Script
 *
 * Migrates image URLs from GCS public URLs to Firebase Storage URLs.
 * This ensures all storage access goes through Firebase security rules.
 *
 * OLD FORMAT (GCS public URL):
 *   https://storage.googleapis.com/bucket-name/teams/file-id
 *
 * NEW FORMAT (Firebase Storage URL):
 *   https://firebasestorage.googleapis.com/v0/b/bucket-name/o/teams%2Ffile-id?alt=media
 *
 * Usage:
 *   npm run script:migrate-storage-urls -- --dry-run
 *   npm run script:migrate-storage-urls
 *
 * Options:
 *   --dry-run  Preview migration without making changes
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

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

interface MigrationStats {
	teams: { updated: number; skipped: number; errors: number }
	badges: { updated: number; skipped: number; errors: number }
}

/**
 * Converts a GCS public URL to a Firebase Storage URL
 *
 * Input:  https://storage.googleapis.com/bucket-name/path/to/file
 * Output: https://firebasestorage.googleapis.com/v0/b/bucket-name/o/path%2Fto%2Ffile?alt=media
 */
function convertGcsUrlToFirebaseUrl(gcsUrl: string): string | null {
	// Match GCS public URL pattern
	const gcsPattern = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/
	const match = gcsUrl.match(gcsPattern)

	if (!match) {
		return null // Not a GCS URL
	}

	const bucketName = match[1]
	// Decode first in case path is already URL-encoded, then re-encode properly
	const filePath = decodeURIComponent(match[2])
	const encodedPath = encodeURIComponent(filePath)

	return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`
}

/**
 * Check if a URL is already in Firebase Storage format
 */
function isFirebaseStorageUrl(url: string): boolean {
	return url.startsWith('https://firebasestorage.googleapis.com/')
}

/**
 * Check if a URL is a GCS public URL
 */
function isGcsPublicUrl(url: string): boolean {
	return url.startsWith('https://storage.googleapis.com/')
}

/**
 * Check if a Firebase Storage URL has double-encoded path (broken by previous migration)
 * Double-encoded URLs have %25 which is the encoding of %
 */
function hasDoubleEncodedPath(url: string): boolean {
	return url.includes('%25')
}

/**
 * Fix a double-encoded Firebase Storage URL
 */
function fixDoubleEncodedUrl(url: string): string {
	// Match Firebase Storage URL pattern
	const pattern =
		/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)(.+)(\?alt=media)$/
	const match = url.match(pattern)

	if (!match) {
		return url
	}

	const prefix = match[1]
	const encodedPath = match[2]
	const suffix = match[3]

	// Decode the double-encoded path, then re-encode properly
	const decodedPath = decodeURIComponent(decodeURIComponent(encodedPath))
	const properlyEncodedPath = encodeURIComponent(decodedPath)

	return `${prefix}${properlyEncodedPath}${suffix}`
}

async function migrateStorageUrls(): Promise<void> {
	console.log('🔄 Storage URL Migration Script')
	console.log('================================')

	if (isDryRun) {
		console.log('🏃 DRY RUN MODE - No changes will be made\n')
	}

	initializeFirebase()

	const firestore = getFirestore()
	const stats: MigrationStats = {
		teams: { updated: 0, skipped: 0, errors: 0 },
		badges: { updated: 0, skipped: 0, errors: 0 },
	}

	// Migrate team logos
	console.log('📦 Migrating team logos...\n')

	const teamsSnapshot = await firestore.collection('teams').get()
	console.log(`   Found ${teamsSnapshot.size} teams\n`)

	for (const teamDoc of teamsSnapshot.docs) {
		const teamData = teamDoc.data()
		const teamName = teamData.name || teamDoc.id
		const logoUrl = teamData.logo

		// Skip if no logo
		if (!logoUrl || typeof logoUrl !== 'string') {
			console.log(`   ⏭️  ${teamName}: No logo, skipping`)
			stats.teams.skipped++
			continue
		}

		// Check if it's a Firebase Storage URL
		if (isFirebaseStorageUrl(logoUrl)) {
			// Check if it has double-encoded path (broken by previous migration)
			if (hasDoubleEncodedPath(logoUrl)) {
				const fixedUrl = fixDoubleEncodedUrl(logoUrl)

				if (isDryRun) {
					console.log(`   🔧 ${teamName}: Would fix double-encoded URL`)
					console.log(`      Old: ${logoUrl}`)
					console.log(`      New: ${fixedUrl}`)
					stats.teams.updated++
				} else {
					try {
						await teamDoc.ref.update({ logo: fixedUrl })
						console.log(`   🔧 ${teamName}: Fixed double-encoded URL`)
						console.log(`      Old: ${logoUrl}`)
						console.log(`      New: ${fixedUrl}`)
						stats.teams.updated++
					} catch (error) {
						console.log(`   ❌ ${teamName}: Failed to fix URL`)
						console.error(error)
						stats.teams.errors++
					}
				}
				continue
			}

			console.log(`   ✅ ${teamName}: Already using Firebase Storage URL`)
			stats.teams.skipped++
			continue
		}

		// Check if it's a GCS URL that needs migration
		if (!isGcsPublicUrl(logoUrl)) {
			console.log(
				`   ⚠️  ${teamName}: Unknown URL format, skipping: ${logoUrl}`
			)
			stats.teams.skipped++
			continue
		}

		// Convert the URL
		const newUrl = convertGcsUrlToFirebaseUrl(logoUrl)
		if (!newUrl) {
			console.log(`   ❌ ${teamName}: Failed to convert URL: ${logoUrl}`)
			stats.teams.errors++
			continue
		}

		if (isDryRun) {
			console.log(`   📝 ${teamName}: Would update logo URL`)
			console.log(`      Old: ${logoUrl}`)
			console.log(`      New: ${newUrl}`)
			stats.teams.updated++
		} else {
			try {
				await teamDoc.ref.update({ logo: newUrl })
				console.log(`   ✅ ${teamName}: Updated logo URL`)
				console.log(`      Old: ${logoUrl}`)
				console.log(`      New: ${newUrl}`)
				stats.teams.updated++
			} catch (error) {
				console.log(`   ❌ ${teamName}: Failed to update`)
				console.error(error)
				stats.teams.errors++
			}
		}
	}

	// Migrate badge images
	console.log('\n🏅 Migrating badge images...\n')

	const badgesSnapshot = await firestore.collection('badges').get()
	console.log(`   Found ${badgesSnapshot.size} badges\n`)

	for (const badgeDoc of badgesSnapshot.docs) {
		const badgeData = badgeDoc.data()
		const badgeName = badgeData.name || badgeDoc.id
		const imageUrl = badgeData.imageUrl

		// Skip if no image
		if (!imageUrl || typeof imageUrl !== 'string') {
			console.log(`   ⏭️  ${badgeName}: No image, skipping`)
			stats.badges.skipped++
			continue
		}

		// Check if it's a Firebase Storage URL
		if (isFirebaseStorageUrl(imageUrl)) {
			// Check if it has double-encoded path (broken by previous migration)
			if (hasDoubleEncodedPath(imageUrl)) {
				const fixedUrl = fixDoubleEncodedUrl(imageUrl)

				if (isDryRun) {
					console.log(`   🔧 ${badgeName}: Would fix double-encoded URL`)
					console.log(`      Old: ${imageUrl}`)
					console.log(`      New: ${fixedUrl}`)
					stats.badges.updated++
				} else {
					try {
						await badgeDoc.ref.update({ imageUrl: fixedUrl })
						console.log(`   🔧 ${badgeName}: Fixed double-encoded URL`)
						console.log(`      Old: ${imageUrl}`)
						console.log(`      New: ${fixedUrl}`)
						stats.badges.updated++
					} catch (error) {
						console.log(`   ❌ ${badgeName}: Failed to fix URL`)
						console.error(error)
						stats.badges.errors++
					}
				}
				continue
			}

			console.log(`   ✅ ${badgeName}: Already using Firebase Storage URL`)
			stats.badges.skipped++
			continue
		}

		// Check if it's a GCS URL that needs migration
		if (!isGcsPublicUrl(imageUrl)) {
			console.log(
				`   ⚠️  ${badgeName}: Unknown URL format, skipping: ${imageUrl}`
			)
			stats.badges.skipped++
			continue
		}

		// Convert the URL
		const newUrl = convertGcsUrlToFirebaseUrl(imageUrl)
		if (!newUrl) {
			console.log(`   ❌ ${badgeName}: Failed to convert URL: ${imageUrl}`)
			stats.badges.errors++
			continue
		}

		if (isDryRun) {
			console.log(`   📝 ${badgeName}: Would update image URL`)
			console.log(`      Old: ${imageUrl}`)
			console.log(`      New: ${newUrl}`)
			stats.badges.updated++
		} else {
			try {
				await badgeDoc.ref.update({ imageUrl: newUrl })
				console.log(`   ✅ ${badgeName}: Updated image URL`)
				console.log(`      Old: ${imageUrl}`)
				console.log(`      New: ${newUrl}`)
				stats.badges.updated++
			} catch (error) {
				console.log(`   ❌ ${badgeName}: Failed to update`)
				console.error(error)
				stats.badges.errors++
			}
		}
	}

	// Print summary
	console.log('\n================================')
	console.log('📊 Migration Summary')
	console.log('================================\n')

	if (isDryRun) {
		console.log('🏃 DRY RUN - No changes were made\n')
	}

	console.log('Teams:')
	console.log(`   Updated: ${stats.teams.updated}`)
	console.log(`   Skipped: ${stats.teams.skipped}`)
	console.log(`   Errors:  ${stats.teams.errors}`)

	console.log('\nBadges:')
	console.log(`   Updated: ${stats.badges.updated}`)
	console.log(`   Skipped: ${stats.badges.skipped}`)
	console.log(`   Errors:  ${stats.badges.errors}`)

	const totalUpdated = stats.teams.updated + stats.badges.updated
	const totalErrors = stats.teams.errors + stats.badges.errors

	console.log('')

	if (totalErrors > 0) {
		console.log(`⚠️  Completed with ${totalErrors} errors`)
		process.exit(1)
	} else if (totalUpdated === 0) {
		console.log('✅ No URLs needed migration')
	} else if (isDryRun) {
		console.log(`✅ Dry run complete - ${totalUpdated} URLs would be updated`)
		console.log('\nRun without --dry-run to apply changes')
	} else {
		console.log(`✅ Successfully migrated ${totalUpdated} URLs`)
	}
}

// Run migration
migrateStorageUrls().catch((error) => {
	console.error('\n❌ Migration failed:', error)
	process.exit(1)
})
