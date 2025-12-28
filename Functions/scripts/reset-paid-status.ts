#!/usr/bin/env npx tsx
/**
 * Reset Paid Status Script
 *
 * Ensures all players have paid=false for a specific season.
 * This is useful when setting up a new season to ensure no one
 * has an incorrect paid status carried over.
 *
 * Usage:
 *   npm run script:reset-paid -- --dry-run
 *   npm run script:reset-paid
 *
 * Options:
 *   --dry-run  Preview changes without making updates
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// ============================================
// CONFIGURATION - Update this for your season
// ============================================
const TARGET_SEASON_ID = '3epXJwsXxMViBLeOSozZ'
// ============================================

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

interface PlayerSeason {
	season: FirebaseFirestore.DocumentReference
	paid: boolean
	signed: boolean
	banned: boolean
	captain: boolean
	team: FirebaseFirestore.DocumentReference | null
	lookingForTeam: boolean
}

interface PlayerDocument {
	firstname: string
	lastname: string
	email: string
	seasons?: PlayerSeason[]
}

interface Stats {
	totalPlayers: number
	playersWithSeason: number
	playersAlreadyUnpaid: number
	playersUpdated: number
	errors: number
}

async function resetPaidStatus(): Promise<void> {
	console.log('🔄 Reset Paid Status Script')
	console.log('===========================')
	console.log(`Target Season ID: ${TARGET_SEASON_ID}`)

	if (isDryRun) {
		console.log('🏃 DRY RUN MODE - No changes will be made\n')
	} else {
		console.log('')
	}

	initializeFirebase()

	const firestore = getFirestore()
	const stats: Stats = {
		totalPlayers: 0,
		playersWithSeason: 0,
		playersAlreadyUnpaid: 0,
		playersUpdated: 0,
		errors: 0,
	}

	// Get all players
	console.log('📦 Fetching all players...\n')
	const playersSnapshot = await firestore.collection('players').get()
	stats.totalPlayers = playersSnapshot.size
	console.log(`   Found ${stats.totalPlayers} players\n`)

	// Process each player
	for (const playerDoc of playersSnapshot.docs) {
		const playerData = playerDoc.data() as PlayerDocument
		const playerName = `${playerData.firstname} ${playerData.lastname}`

		// Check if player has seasons array
		if (!playerData.seasons || playerData.seasons.length === 0) {
			continue
		}

		// Find the season entry for target season
		const seasonIndex = playerData.seasons.findIndex(
			(s) => s.season?.id === TARGET_SEASON_ID
		)

		if (seasonIndex === -1) {
			// Player doesn't have this season
			continue
		}

		stats.playersWithSeason++
		const seasonEntry = playerData.seasons[seasonIndex]

		// Check if paid is already false
		if (seasonEntry.paid === false) {
			stats.playersAlreadyUnpaid++
			continue
		}

		// Need to update this player
		if (isDryRun) {
			console.log(`   📝 ${playerName}: Would set paid=false (currently true)`)
			stats.playersUpdated++
		} else {
			try {
				// Create updated seasons array
				const updatedSeasons = [...playerData.seasons]
				updatedSeasons[seasonIndex] = {
					...updatedSeasons[seasonIndex],
					paid: false,
				}

				await playerDoc.ref.update({ seasons: updatedSeasons })
				console.log(`   ✅ ${playerName}: Set paid=false`)
				stats.playersUpdated++
			} catch (error) {
				console.log(`   ❌ ${playerName}: Failed to update`)
				console.error(error)
				stats.errors++
			}
		}
	}

	// Print summary
	console.log('\n===========================')
	console.log('📊 Summary')
	console.log('===========================\n')

	if (isDryRun) {
		console.log('🏃 DRY RUN - No changes were made\n')
	}

	console.log(`Total players:              ${stats.totalPlayers}`)
	console.log(`Players with this season:   ${stats.playersWithSeason}`)
	console.log(`Already had paid=false:     ${stats.playersAlreadyUnpaid}`)
	console.log(`Updated to paid=false:      ${stats.playersUpdated}`)
	console.log(`Errors:                     ${stats.errors}`)

	console.log('')

	if (stats.errors > 0) {
		console.log(`⚠️  Completed with ${stats.errors} errors`)
		process.exit(1)
	} else if (stats.playersUpdated === 0) {
		console.log('✅ No players needed updating - all already have paid=false')
	} else if (isDryRun) {
		console.log(
			`✅ Dry run complete - ${stats.playersUpdated} players would be updated`
		)
		console.log('\nRun without --dry-run to apply changes')
	} else {
		console.log(
			`✅ Successfully updated ${stats.playersUpdated} players to paid=false`
		)
	}
}

// Run script
resetPaidStatus().catch((error) => {
	console.error('\n❌ Script failed:', error)
	process.exit(1)
})
