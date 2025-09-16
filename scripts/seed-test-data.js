#!/usr/bin/env node

/**
 * Test Data Seeding Script for Minneapolis Winter League
 *
 * This script populates the Firebase emulator with comprehensive test data
 * for development and testing purposes.
 *
 * Usage:
 * Full seeding:
 *   node scripts/seed-test-data.js
 *
 * Incremental weekly seeding:
 *   node scripts/seed-test-data.js --week 1 --season "2025 Season"
 *   node scripts/seed-test-data.js --week 2 --season "2025 Season"
 *
 * Setup only (seasons, teams, players):
 *   node scripts/seed-test-data.js --setup-only
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { readdir, readFile } from 'fs/promises'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'

// Initialize Firebase Admin SDK for local emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199'

const app = initializeApp({
	projectId: 'minnesota-winter-league', // Match the emulator project ID
	storageBucket: 'minnesota-winter-league.appspot.com', // Storage bucket for emulator
})

const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)

// Get the directory path for this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Track used images to avoid duplicates
const usedImages = new Set()

// Parse command line arguments
const args = process.argv.slice(2)
const config = {
	mode: 'full', // 'full', 'setup-only', 'weekly'
	seasonName: null,
	weekNumber: null,
}

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case '--setup-only':
			config.mode = 'setup-only'
			break
		case '--week':
			config.mode = 'weekly'
			config.weekNumber = parseInt(args[i + 1])
			i++ // Skip next argument
			break
		case '--season':
			config.seasonName = args[i + 1]
			i++ // Skip next argument
			break
		case '--help':
		case '-h':
			console.log(`
Minneapolis Winter League Test Data Seeder

Usage:
  Full seeding (default):
    node scripts/seed-test-data.js

  Setup only (seasons, teams, players):
    node scripts/seed-test-data.js --setup-only

  Weekly incremental seeding:
    node scripts/seed-test-data.js --week <number> --season "<name>"

Examples:
  node scripts/seed-test-data.js --week 1 --season "2025 Season"
  node scripts/seed-test-data.js --week 2 --season "2025 Season"
			`)
			process.exit(0)
		default:
			break
	}
}

// Validate weekly mode arguments
if (config.mode === 'weekly') {
	if (!config.weekNumber || config.weekNumber < 1 || config.weekNumber > 7) {
		console.error('❌ Invalid week number. Must be between 1 and 7.')
		process.exit(1)
	}
	if (!config.seasonName) {
		console.error(
			'❌ Season name is required for weekly seeding. Use --season "Season Name"'
		)
		process.exit(1)
	}
}

console.log(`🎯 Seeding mode: ${config.mode}`)
if (config.mode === 'weekly') {
	console.log(`📅 Target: Week ${config.weekNumber} of "${config.seasonName}"`)
}

// Collections enum - matching the app structure
const Collections = {
	GAMES: 'games',
	OFFERS: 'offers',
	PLAYERS: 'players',
	SEASONS: 'seasons',
	TEAMS: 'teams',
	WAIVERS: 'waivers',
}

const GameType = {
	REGULAR: 'regular',
	PLAYOFF: 'playoff',
}

// Helper function to create timestamps in Central timezone
const createDate = (dateString) => {
	// Create date in Central timezone by specifying the timezone offset
	// If the dateString includes time, use it directly with CST offset
	// Otherwise, assume it's a date-only string and add midnight in CST
	const dateWithTimezone = dateString.includes('T')
		? dateString + '-06:00' // Add CST offset to existing time
		: dateString + 'T00:00:00-06:00' // Add midnight CST to date-only strings

	const date = new Date(dateWithTimezone)
	return Timestamp.fromDate(date)
}

// Helper function to create document references
const createRef = (collection, id) => {
	return db.collection(collection).doc(id)
}

// Helper function to generate realistic document IDs
const generateDocId = () => {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let result = ''
	for (let i = 0; i < 20; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

// Function to get available images from scripts/images directory
async function getAvailableImages() {
	try {
		const imagesDir = join(__dirname, 'images')
		const files = await readdir(imagesDir)

		// Filter for image files and exclude already used images
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
		const availableImages = files.filter((file) => {
			const ext = extname(file).toLowerCase()
			return imageExtensions.includes(ext) && !usedImages.has(file)
		})

		return availableImages
	} catch (error) {
		console.error('Error reading images directory:', error)
		return []
	}
}

// Function to select and upload a random team logo from available images
async function selectAndUploadTeamLogo(teamName, teamId) {
	try {
		const availableImages = await getAvailableImages()

		if (availableImages.length === 0) {
			console.error(`     No available images left for ${teamName}`)
			return {
				logoUrl: null,
				storagePath: null,
			}
		}

		// Select a random image from available ones
		const randomIndex = Math.floor(Math.random() * availableImages.length)
		const selectedImage = availableImages[randomIndex]

		// Mark this image as used
		usedImages.add(selectedImage)

		// Read the image file
		const imagePath = join(__dirname, 'images', selectedImage)
		const imageBuffer = await readFile(imagePath)

		// Determine content type based on file extension
		const ext = extname(selectedImage).toLowerCase()
		const contentTypeMap = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
		}
		const contentType = contentTypeMap[ext] || 'image/jpeg'

		// Upload to Firebase Storage
		const bucket = storage.bucket('minnesota-winter-league.appspot.com')
		const fileName = `team-logos/${teamId}${ext}`
		const file = bucket.file(fileName)

		await file.save(imageBuffer, {
			metadata: {
				contentType: contentType,
				metadata: {
					teamName: teamName,
					originalFileName: selectedImage,
					uploadedAt: new Date().toISOString(),
				},
			},
		})

		// Make the file publicly readable
		await file.makePublic()

		// Get the public URL (for emulator, this will be the emulator URL)
		const publicUrl = `http://127.0.0.1:9199/v0/b/minnesota-winter-league.appspot.com/o/${encodeURIComponent(fileName)}?alt=media`

		console.log(
			`     Selected and uploaded image ${selectedImage} for ${teamName}`
		)

		return {
			logoUrl: publicUrl,
			storagePath: fileName,
		}
	} catch (error) {
		console.error(`     Error selecting logo for ${teamName}:`, error)
		return {
			logoUrl: null,
			storagePath: null,
		}
	}
}

async function seedTestData() {
	console.log('🌱 Starting test data seeding...')

	try {
		if (config.mode === 'weekly') {
			// Weekly incremental seeding
			await seedWeeklyGames()
		} else {
			// Full seeding or setup-only
			await seedFullData()
		}

		console.log('✅ Test data seeding completed successfully!')
	} catch (error) {
		console.error('❌ Error during seeding:', error)
		process.exit(1)
	}
}

/**
 * Seed games for a specific week
 */
async function seedWeeklyGames() {
	console.log(
		`🎯 Creating games for Week ${config.weekNumber} of "${config.seasonName}"`
	)

	// Validate that season exists
	const seasonSnapshot = await db
		.collection(Collections.SEASONS)
		.where('name', '==', config.seasonName)
		.limit(1)
		.get()

	if (seasonSnapshot.empty) {
		throw new Error(
			`Season "${config.seasonName}" not found. Please run setup first.`
		)
	}

	// Validate that teams exist for this season
	const seasonDoc = seasonSnapshot.docs[0]
	const teamsSnapshot = await db
		.collection(Collections.TEAMS)
		.where('season', '==', seasonDoc.ref)
		.get()

	if (teamsSnapshot.empty) {
		throw new Error(
			`No teams found for season "${config.seasonName}". Please run setup first.`
		)
	}

	// Check if games for this week already exist
	const season = seasonDoc.data()
	const gameDates = getGameDates(season.dateStart, season.dateEnd)
	const targetDate = gameDates[config.weekNumber - 1]

	if (!targetDate) {
		throw new Error(
			`Week ${config.weekNumber} exceeds season schedule (${gameDates.length} weeks available)`
		)
	}

	const startOfDay = createDate(`${targetDate}T00:00:00`)
	const endOfDay = createDate(`${targetDate}T23:59:59`)

	const existingGamesSnapshot = await db
		.collection(Collections.GAMES)
		.where('season', '==', seasonDoc.ref)
		.where('date', '>=', startOfDay)
		.where('date', '<=', endOfDay)
		.get()

	if (!existingGamesSnapshot.empty) {
		console.log(
			`⚠️  Week ${config.weekNumber} already has ${existingGamesSnapshot.size} games.`
		)
		const response = await promptUser(
			'Do you want to delete existing games and recreate? (y/N): '
		)
		if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
			// Delete existing games
			const batch = db.batch()
			existingGamesSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log(`🗑️  Deleted ${existingGamesSnapshot.size} existing games`)
		} else {
			console.log('❌ Cancelled. No changes made.')
			return
		}
	}

	// Create games for the specified week
	const games = await createGamesForWeek(config.seasonName, config.weekNumber)

	// If this is Week 7 (championship), update team placements
	if (config.weekNumber === 7) {
		console.log(
			'🏆 Calculating final team placements from championship results...'
		)

		// Get all teams for this season
		const teamsSnapshot = await db
			.collection(Collections.TEAMS)
			.where('season', '==', seasonDoc.ref)
			.get()

		const teams = teamsSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}))

		// Get all games for this season
		const allGamesSnapshot = await db
			.collection(Collections.GAMES)
			.where('season', '==', seasonDoc.ref)
			.get()

		const allGames = allGamesSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}))

		// Update team placements based on all results
		await updateTeamPlacements(teams, allGames)
		console.log('✅ Team placements updated')
	}

	console.log(`\n📊 Summary:`)
	console.log(
		`   • Created ${games.length} games for Week ${config.weekNumber}`
	)
	console.log(`   • Season: ${config.seasonName}`)
	console.log(`   • Date: ${targetDate}`)

	if (config.weekNumber === 7) {
		console.log(`   • Final team placements calculated`)
	}
}

/**
 * Full seeding (original functionality)
 */
async function seedFullData() {
	// Clear existing data first
	await clearCollections()

	// Reset used images tracking for fresh start
	usedImages.clear()
	console.log('🎨 Reset image tracking for team logos...')

	// Get existing auth users (don't create new ones)
	const authUsers = await getExistingAuthUsers()

	// Create test data in order (dependencies matter)
	const seasons = await createSeasons()
	const players = await createPlayersFromAuth(authUsers)

	// Separate seasons by type for different processing
	const pastSeasons = seasons.filter(
		(s) => parseInt(s.name.split(' ')[0]) <= 2025
	)
	const futureSeasons = seasons.filter(
		(s) => parseInt(s.name.split(' ')[0]) >= 2026
	)

	// Create teams and games for historical and current seasons
	const teams = await createTeamsForActiveSeasons(pastSeasons, players)
	const games = await createGamesForActiveSeasons(pastSeasons, teams)

	// Create empty placeholder data for future seasons
	await createPlaceholderDataForFutureSeasons(futureSeasons)

	// Calculate and update team placements based on playoff results
	await updateTeamPlacements(teams, games)

	// Skipping offers and waivers.

	// Create empty placeholder data for future seasons
	await createPlaceholderDataForFutureSeasons(futureSeasons)

	console.log('\n📊 Summary:')
	console.log(
		`   • ${seasons.length} seasons (${pastSeasons.length} active, ${futureSeasons.length} future placeholders)`
	)
	console.log(`   • ${players.length} players from existing auth users`)
	console.log(`   • ${teams.length} teams with alliterative names`)
	console.log(`   • ${usedImages.size} unique images used for team logos`)

	if (usedImages.size > 0) {
		console.log('\n🎨 Images used for team logos:')
		Array.from(usedImages)
			.sort()
			.forEach((image) => console.log(`     • ${image}`))
	}

	console.log('\n🎯 You can now stop the emulators to export this data.')
}

/**
 * Simple prompt utility for user input
 */
async function promptUser(question) {
	const readline = await import('readline')
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close()
			resolve(answer)
		})
	})
}

async function clearCollections() {
	console.log('🧹 Clearing existing collections...')

	const collections = Object.values(Collections)

	for (const collectionName of collections) {
		const snapshot = await db.collection(collectionName).get()
		const batch = db.batch()

		snapshot.docs.forEach((doc) => {
			batch.delete(doc.ref)
		})

		if (!snapshot.empty) {
			await batch.commit()
			console.log(
				`   Cleared ${snapshot.size} documents from ${collectionName}`
			)
		}
	}
}

async function getExistingAuthUsers() {
	console.log('👥 Getting existing authentication users...')

	const listUsersResult = await auth.listUsers()
	const users = listUsersResult.users.map((user) => ({
		uid: user.uid,
		email: user.email,
		displayName: user.displayName || 'Unknown User',
	}))

	console.log(`   Found ${users.length} existing auth users`)
	return users
}

async function createSeasons() {
	console.log('🗓️ Creating seasons...')

	const seasonsData = [
		{
			name: '2023 Fall',
			dateStart: createDate('2023-11-04'),
			dateEnd: createDate('2023-12-16'),
			registrationStart: createDate('2023-10-01'),
			registrationEnd: createDate('2023-10-31'),
			teams: [],
		},
		{
			name: '2024 Fall',
			dateStart: createDate('2024-11-02'),
			dateEnd: createDate('2024-12-14'),
			registrationStart: createDate('2024-10-01'),
			registrationEnd: createDate('2024-10-31'),
			teams: [],
		},
		{
			name: '2025 Fall',
			dateStart: createDate('2025-11-01'),
			dateEnd: createDate('2025-12-13'),
			registrationStart: createDate('2025-10-01'),
			registrationEnd: createDate('2025-10-31'),
			teams: [],
		},
		{
			name: '2026 Winter',
			dateStart: createDate('2026-02-07'),
			dateEnd: createDate('2026-03-21'),
			registrationStart: createDate('2026-01-01'),
			registrationEnd: createDate('2026-01-31'),
			teams: [],
		},
	]

	const seasons = []
	const currentDate = new Date()

	for (const seasonData of seasonsData) {
		// Determine status based on season end date (for internal logic only, not stored)
		const seasonEndDate = seasonData.dateEnd.toDate()
		const status = seasonEndDate < currentDate ? 'historical' : 'active'

		// Save season without status field
		const docRef = await db.collection(Collections.SEASONS).add(seasonData)

		// Keep status in memory for game generation logic
		const seasonWithStatus = { id: docRef.id, ...seasonData, status }
		seasons.push(seasonWithStatus)
		console.log(`   Created season: ${seasonData.name} (${status})`)
	}

	return seasons
}

async function createPlayersFromAuth(authUsers) {
	console.log('🏒 Creating player documents from auth users...')

	const players = authUsers.map((user) => {
		// Extract first and last name from display name
		const nameParts = user.displayName.split(' ')
		const firstname = nameParts[0] || 'Unknown'
		const lastname = nameParts.slice(1).join(' ') || 'User'

		return {
			admin: false, // All non-admin as requested
			email: user.email,
			firstname: firstname,
			lastname: lastname,
			seasons: [], // Will be populated when teams are assigned
		}
	})

	const createdPlayers = []
	for (let i = 0; i < players.length; i++) {
		const player = players[i]
		const user = authUsers[i]
		await db.collection(Collections.PLAYERS).doc(user.uid).set(player)
		createdPlayers.push({ id: user.uid, ...player })
		console.log(`   Created player: ${player.firstname} ${player.lastname}`)
	}

	return createdPlayers
}

// Helper function to generate team names with Minnesota cities and alliterative nouns
function generateTeamNames(count) {
	// Minnesota cities grouped by first letter
	const minnesotatCities = {
		A: [
			'Anoka',
			'Albert Lea',
			'Alexandria',
			'Austin',
			'Apple Valley',
			'Andover',
		],
		B: [
			'Bloomington',
			'Burnsville',
			'Brooklyn Park',
			'Brooklyn Center',
			'Brainerd',
			'Bemidji',
			'Blaine',
		],
		C: [
			'Chaska',
			'Coon Rapids',
			'Crystal',
			'Columbia Heights',
			'Chanhassen',
			'Cottage Grove',
			'Cloquet',
		],
		D: ['Duluth', 'Dakota', 'Dayton', 'Delano', 'Detroit Lakes'],
		E: ['Edina', 'Eagan', 'Eden Prairie', 'Elk River', 'Excelsior'],
		F: [
			'Fridley',
			'Faribault',
			'Fergus Falls',
			'Forest Lake',
			'Falcon Heights',
		],
		G: ['Golden Valley', 'Grand Rapids', 'Goodhue', 'Glencoe'],
		H: ['Hopkins', 'Hastings', 'Hibbing', 'Hugo', 'Ham Lake'],
		I: ['Inver Grove Heights', 'International Falls', 'Isanti'],
		J: ['Jordan', 'Janesville'],
		K: ['Kenyon', 'Kasson'],
		L: ['Lakeville', 'Little Canada', 'Lino Lakes', 'Lakewood', 'Lauderdale'],
		M: [
			'Minneapolis',
			'Minnetonka',
			'Maple Grove',
			'Mankato',
			'Moorhead',
			'Marshall',
			'Mounds View',
		],
		N: ['New Brighton', 'North St. Paul', 'Northfield', 'New Hope', 'Newport'],
		O: ['Oakdale', 'Owatonna', 'Orono'],
		P: ['Plymouth', 'Prior Lake', 'Park Rapids'],
		R: [
			'Roseville',
			'Rochester',
			'Richfield',
			'Ramsey',
			'Rosemount',
			'Red Wing',
		],
		S: [
			'St. Paul',
			'Savage',
			'Stillwater',
			'St. Cloud',
			'Shoreview',
			'South St. Paul',
		],
		T: ['Thief River Falls', 'Two Harbors'],
		V: ['Victoria', 'Virginia'],
		W: [
			'Woodbury',
			'White Bear Lake',
			'Wayzata',
			'Winona',
			'Willmar',
			'West St. Paul',
		],
		Y: ['Young America'],
		Z: ['Zimmerman'],
	}

	// Alliterative nouns grouped by first letter
	const nouns = {
		A: [
			'Alligators',
			'Antelopes',
			'Armadillos',
			'Ants',
			'Apes',
			'Archers',
			'Aviators',
		],
		B: [
			'Bears',
			'Bobcats',
			'Bison',
			'Badgers',
			'Bulls',
			'Bees',
			'Bulldogs',
			'Broncos',
		],
		C: [
			'Cheetahs',
			'Cardinals',
			'Cougars',
			'Cobras',
			'Cranes',
			'Colts',
			'Cyclones',
		],
		D: ['Dragons', 'Deer', 'Dolphins', 'Dogs', 'Ducks', 'Daredevils'],
		E: ['Eagles', 'Elephants', 'Eels', 'Elks', 'Emperors'],
		F: ['Foxes', 'Falcons', 'Flamingos', 'Frogs', 'Fighters'],
		G: ['Grizzlies', 'Geese', 'Gophers', 'Gazelles', 'Guardians'],
		H: ['Hawks', 'Horses', 'Huskies', 'Hornets', 'Hunters'],
		I: ['Iguanas', 'Ibis', 'Impalas', 'Indians'],
		J: ['Jaguars', 'Jackals', 'Jays', 'Jumpers'],
		K: ['Kangaroos', 'Kings', 'Knights', 'Kestrels'],
		L: ['Lions', 'Leopards', 'Llamas', 'Lynx', 'Lightning'],
		M: ['Moose', 'Mantises', 'Mustangs', 'Marlins', 'Mavericks'],
		N: ['Nighthawks', 'Narwhals', 'Newts', 'Ninjas'],
		O: ['Owls', 'Otters', 'Orcas', 'Ocelots'],
		P: ['Panthers', 'Penguins', 'Pumas', 'Pelicans', 'Pirates'],
		R: ['Ravens', 'Raccoons', 'Rhinos', 'Rams', 'Rangers'],
		S: ['Stallions', 'Salamanders', 'Sharks', 'Seals', 'Spartans'],
		T: ['Tigers', 'Turtles', 'Titans', 'Thunderbirds'],
		V: ['Vipers', 'Vultures', 'Vikings', 'Velociraptors'],
		W: ['Wolves', 'Walruses', 'Whales', 'Wildcats', 'Warriors'],
		Y: ['Yaks', 'Yellowhammers'],
		Z: ['Zebras', 'Zephyrs'],
	}

	const teamNames = []
	const usedCombinations = new Set()

	// Create all possible combinations first
	const allCombinations = []
	for (const [letter, cities] of Object.entries(minnesotatCities)) {
		const letterNouns = nouns[letter] || []
		for (const city of cities) {
			for (const noun of letterNouns) {
				allCombinations.push(`${city} ${noun}`)
			}
		}
	}

	// Shuffle all combinations to ensure random selection
	const shuffledCombinations = shuffleArray(allCombinations)

	// Take the first 'count' combinations
	for (let i = 0; i < Math.min(count, shuffledCombinations.length); i++) {
		teamNames.push(shuffledCombinations[i])
	}

	if (teamNames.length < count) {
		console.warn(
			`Warning: Could only generate ${teamNames.length} unique team names out of ${count} requested`
		)
	}

	return teamNames
}

async function createTeamsForActiveSeasons(seasons, players) {
	console.log('🏒 Creating teams for active seasons (with full rosters)...')

	// Check if we have enough players for unique assignment per season
	// With 12 teams and 15 players per team, we need 180 players per season
	const playersNeeded = 12 * 15 // 180 players per season
	if (players.length < playersNeeded) {
		console.log(
			`   Warning: Only ${players.length} players available, but ideally need ${playersNeeded} for completely unique teams`
		)
		console.log('   Some players will appear on multiple teams within a season')
	}

	// Generate team names for all active seasons (12 teams per season)
	const totalTeamsNeeded = seasons.length * 12
	const allTeamNames = generateTeamNames(totalTeamsNeeded)
	console.log(
		`   Generated ${allTeamNames.length} unique team names for ${seasons.length} seasons`
	)

	const teams = []
	let teamIndex = 0

	// Track existing teamIds from previous seasons for potential reuse
	const existingTeamIds = []

	// Track player assignments across all seasons to enable multi-season participation
	const allPlayerAssignments = new Map()

	for (const season of seasons) {
		console.log(`   Creating teams for ${season.name}...`)

		const seasonTeams = []

		// Track teamIds used in this season to prevent duplicates
		const usedTeamIdsThisSeason = new Set()

		// Create a shuffled pool of players for this season
		// Each player should only be on one team per season
		const seasonPlayerPool = shuffleArray([...players])
		let playerIndex = 0

		for (let i = 0; i < 12; i++) {
			const teamName = allTeamNames[teamIndex]

			// Randomly decide whether to reuse an existing teamId or create a new one
			// 30% chance to reuse an existing teamId if available, 70% chance for new teamId
			let consistentTeamId
			let isCarryoverTeam = false

			// Filter out teamIds already used in this season
			const availableTeamIds = existingTeamIds.filter(
				(id) => !usedTeamIdsThisSeason.has(id)
			)

			if (availableTeamIds.length > 0 && Math.random() < 0.3) {
				// Reuse a random existing teamId that hasn't been used in this season
				const randomIndex = Math.floor(Math.random() * availableTeamIds.length)
				consistentTeamId = availableTeamIds[randomIndex]
				isCarryoverTeam = true
			} else {
				// Create a new teamId
				consistentTeamId = generateDocId()
				existingTeamIds.push(consistentTeamId)
			}

			// Mark this teamId as used in this season
			usedTeamIdsThisSeason.add(consistentTeamId)

			// Random registration date in October of the year before season start
			const seasonYear = season.dateStart.toDate().getFullYear()
			const registrationYear = seasonYear
			const randomDay = Math.floor(Math.random() * 31) + 1 // October has 31 days
			const registrationDate = createDate(
				`${registrationYear}-10-${randomDay.toString().padStart(2, '0')}`
			)

			// Assign 15 players to each team
			const teamSize = 15

			// Get the next 15 players from the season pool
			// If we run out of unique players, cycle back to the beginning
			const teamPlayers = []
			for (let j = 0; j < teamSize; j++) {
				teamPlayers.push(
					seasonPlayerPool[playerIndex % seasonPlayerPool.length]
				)
				playerIndex++
			}

			const roster = teamPlayers.map((player, index) => ({
				captain: index === 0, // First player is captain
				player: createRef(Collections.PLAYERS, player.id),
			}))

			// Generate and upload team logo from random image
			const logoData = await selectAndUploadTeamLogo(teamName, consistentTeamId)

			const teamData = {
				logo: logoData.logoUrl,
				name: teamName,
				placement: null, // Will be calculated after games are completed
				registered: true,
				registeredDate: registrationDate,
				roster: roster,
				season: createRef(Collections.SEASONS, season.id),
				storagePath: logoData.storagePath,
				teamId: consistentTeamId,
			}

			const docRef = await db.collection(Collections.TEAMS).add(teamData)
			const team = { id: docRef.id, ...teamData }
			teams.push(team)
			seasonTeams.push(createRef(Collections.TEAMS, docRef.id))

			// Track player assignments for updating seasons later
			for (const rosterEntry of roster) {
				const playerId = rosterEntry.player.id
				if (!allPlayerAssignments.has(playerId)) {
					allPlayerAssignments.set(playerId, [])
				}

				allPlayerAssignments.get(playerId).push({
					banned: false,
					captain: rosterEntry.captain,
					paid: true, // All players have paid
					season: createRef(Collections.SEASONS, season.id),
					signed: true, // All players have signed waiver
					team: createRef(Collections.TEAMS, docRef.id),
				})
			}

			console.log(
				`     Created team: ${teamName} (Placement: TBD after playoff results, ${teamSize} players)${isCarryoverTeam ? ' [CARRYOVER]' : ''}`
			)

			teamIndex++
		}

		// Update season with team references
		await db.collection(Collections.SEASONS).doc(season.id).update({
			teams: seasonTeams,
		})
	}

	// Update all players with their season participation data
	console.log('🔄 Updating players with season participation...')
	for (const [playerId, seasonData] of allPlayerAssignments) {
		await db.collection(Collections.PLAYERS).doc(playerId).update({
			seasons: seasonData,
		})

		// Log players with multiple seasons
		if (seasonData.length > 1) {
			const player = players.find((p) => p.id === playerId)
			console.log(
				`   Player ${player.firstname} ${player.lastname} participates in ${seasonData.length} seasons`
			)
		}
	}

	return teams
}

// Helper function to shuffle an array
function shuffleArray(array) {
	const shuffled = [...array]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
	}
	return shuffled
}

async function createGamesForActiveSeasons(seasons, teams) {
	console.log('🏒 Creating games for active seasons...')

	const games = []

	// Game times for all seasons
	const gameTimes = [
		'18:00', // 6:00 PM
		'18:45', // 6:45 PM
		'19:30', // 7:30 PM
		'20:15', // 8:15 PM
	]

	// Helper function to get first 7 Saturdays within the season date range
	const getGameDates = (startDate, endDate) => {
		const saturdays = []
		// Convert Firebase Timestamps to JavaScript Date objects
		const start = startDate.toDate()
		const end = endDate.toDate()

		// Start from the first Saturday on or after the start date
		const current = new Date(start)
		const daysUntilSaturday = (6 - current.getDay()) % 7
		current.setDate(current.getDate() + daysUntilSaturday)

		// Collect Saturdays until we reach the end date or have 7 dates
		while (current <= end && saturdays.length < 7) {
			const year = current.getFullYear()
			const month = (current.getMonth() + 1).toString().padStart(2, '0')
			const day = current.getDate().toString().padStart(2, '0')
			saturdays.push(`${year}-${month}-${day}`)

			// Move to next Saturday
			current.setDate(current.getDate() + 7)
		}

		return saturdays
	}

	// Helper function to generate random scores (0-25) ensuring no ties
	const generateGameScores = () => {
		let homeScore, awayScore
		do {
			homeScore = Math.floor(Math.random() * 26)
			awayScore = Math.floor(Math.random() * 26)
		} while (homeScore === awayScore) // Ensure no ties

		return { homeScore, awayScore }
	}

	// Predefined schedule for first 5 weeks (regular season)
	// Each sub-array represents a week, each inner array represents a round (time slot)
	const regularSeasonSchedule = [
		// Week 1
		[
			// Round 1 (18:00)
			[
				[1, 4],
				[2, 5],
				[3, 6],
			],
			// Round 2 (18:45)
			[
				[1, 5],
				[2, 6],
				[3, 4],
			],
			// Round 3 (19:30)
			[
				[7, 10],
				[8, 11],
				[9, 12],
			],
			// Round 4 (20:15)
			[
				[7, 11],
				[8, 12],
				[9, 10],
			],
		],
		// Week 2
		[
			// Round 1 (18:00)
			[
				[11, 3],
				[12, 4],
				[1, 2],
			],
			// Round 2 (18:45)
			[
				[11, 4],
				[12, 2],
				[1, 3],
			],
			// Round 3 (19:30)
			[
				[5, 9],
				[6, 10],
				[7, 8],
			],
			// Round 4 (20:15)
			[
				[5, 10],
				[6, 8],
				[7, 9],
			],
		],
		// Week 3
		[
			// Round 1 (18:00)
			[
				[9, 1],
				[10, 2],
				[11, 12],
			],
			// Round 2 (18:45)
			[
				[9, 2],
				[10, 12],
				[11, 1],
			],
			// Round 3 (19:30)
			[
				[3, 7],
				[4, 8],
				[5, 6],
			],
			// Round 4 (20:15)
			[
				[3, 8],
				[4, 6],
				[5, 7],
			],
		],
		// Week 4
		[
			// Round 1 (18:00)
			[
				[1, 10],
				[2, 8],
				[4, 7],
			],
			// Round 2 (18:45)
			[
				[1, 8],
				[2, 7],
				[4, 10],
			],
			// Round 3 (19:30)
			[
				[3, 9],
				[5, 12],
				[6, 11],
			],
			// Round 4 (20:15)
			[
				[3, 12],
				[5, 11],
				[6, 9],
			],
		],
		// Week 5
		[
			// Round 1 (18:00)
			[
				[1, 6],
				[2, 3],
				[4, 5],
			],
			// Round 2 (18:45)
			[
				[6, 12],
				[8, 9],
				[10, 11],
			],
			// Round 3 (19:30)
			[
				[1, 7],
				[3, 5],
				[2, 4],
			],
			// Round 4 (20:15)
			[
				[7, 12],
				[9, 11],
				[8, 10],
			],
		],
	]

	// Helper function to calculate team standings from regular season games
	const calculateTeamStandings = (seasonTeams, regularSeasonGames) => {
		const teamStats = new Map()

		// Initialize stats for each team
		seasonTeams.forEach((team) => {
			teamStats.set(team.id, {
				team: team,
				wins: 0,
				losses: 0,
				pointsFor: 0,
				pointsAgainst: 0,
				pointDifferential: 0,
				headToHead: new Map(), // Map of opponent team ID to wins against them
			})
		})

		// Calculate stats from regular season games
		regularSeasonGames.forEach((game) => {
			if (game.homeScore !== null && game.awayScore !== null) {
				const homeStats = teamStats.get(game.home.id)
				const awayStats = teamStats.get(game.away.id)

				homeStats.pointsFor += game.homeScore
				homeStats.pointsAgainst += game.awayScore
				awayStats.pointsFor += game.awayScore
				awayStats.pointsAgainst += game.homeScore

				// Determine winner (ties are not allowed)
				if (game.homeScore > game.awayScore) {
					homeStats.wins++
					awayStats.losses++
					// Head-to-head tracking
					homeStats.headToHead.set(
						game.away.id,
						(homeStats.headToHead.get(game.away.id) || 0) + 1
					)
				} else {
					// awayScore > homeScore (since ties are not allowed)
					awayStats.wins++
					homeStats.losses++
					// Head-to-head tracking
					awayStats.headToHead.set(
						game.home.id,
						(awayStats.headToHead.get(game.home.id) || 0) + 1
					)
				}
			}
		})

		// Calculate point differential
		teamStats.forEach((stats) => {
			stats.pointDifferential = stats.pointsFor - stats.pointsAgainst
		})

		// Sort teams by: 1) Wins (desc), 2) Point differential (desc), 3) Head-to-head (complex)
		const sortedTeams = Array.from(teamStats.values()).sort((a, b) => {
			// Primary: Most wins
			if (a.wins !== b.wins) {
				return b.wins - a.wins
			}

			// Secondary: Best point differential
			if (a.pointDifferential !== b.pointDifferential) {
				return b.pointDifferential - a.pointDifferential
			}

			// Tertiary: Head-to-head record (wins against the other team)
			const aWinsVsB = a.headToHead.get(b.team.id) || 0
			const bWinsVsA = b.headToHead.get(a.team.id) || 0
			if (aWinsVsB !== bWinsVsA) {
				return bWinsVsA - aWinsVsB // Higher wins against opponent ranks higher
			}

			// Final tiebreaker: team name (for consistency)
			return a.team.name.localeCompare(b.team.name)
		})

		return sortedTeams
	}

	// Helper function to calculate pool standings from pool play games
	const calculatePoolStandings = (poolTeams, poolGames) => {
		const teamStats = new Map()

		// Initialize stats for pool teams
		poolTeams.forEach((team) => {
			teamStats.set(team.id, {
				team: team,
				wins: 0,
				losses: 0,
				pointsFor: 0,
				pointsAgainst: 0,
				pointDifferential: 0,
				headToHead: new Map(),
			})
		})

		// Calculate stats from pool games
		poolGames.forEach((game) => {
			if (game.homeScore !== null && game.awayScore !== null) {
				const homeStats = teamStats.get(game.home.id)
				const awayStats = teamStats.get(game.away.id)

				homeStats.pointsFor += game.homeScore
				homeStats.pointsAgainst += game.awayScore
				awayStats.pointsFor += game.awayScore
				awayStats.pointsAgainst += game.homeScore

				if (game.homeScore > game.awayScore) {
					homeStats.wins++
					awayStats.losses++
					homeStats.headToHead.set(
						game.away.id,
						(homeStats.headToHead.get(game.away.id) || 0) + 1
					)
				} else {
					// awayScore > homeScore (since ties are not allowed)
					awayStats.wins++
					homeStats.losses++
					awayStats.headToHead.set(
						game.home.id,
						(awayStats.headToHead.get(game.home.id) || 0) + 1
					)
				}
			}
		})

		// Calculate point differential and sort
		teamStats.forEach((stats) => {
			stats.pointDifferential = stats.pointsFor - stats.pointsAgainst
		})

		return Array.from(teamStats.values()).sort((a, b) => {
			if (a.wins !== b.wins) return b.wins - a.wins
			if (a.pointDifferential !== b.pointDifferential)
				return b.pointDifferential - a.pointDifferential
			const aWinsVsB = a.headToHead.get(b.team.id) || 0
			const bWinsVsA = b.headToHead.get(a.team.id) || 0
			if (aWinsVsB !== bWinsVsA) return bWinsVsA - aWinsVsB
			return a.team.name.localeCompare(b.team.name)
		})
	}

	// Week 6 playoff schedule (pool play)
	const week6Schedule = [
		// Round 1 (18:00)
		[
			[1, 8],
			[3, 11],
			[7, 10],
		],
		// Round 2 (18:45)
		[
			[1, 9],
			[4, 5],
			[6, 11],
		],
		// Round 3 (19:30)
		[
			[8, 9],
			[4, 12],
			[2, 7],
		],
		// Round 4 (20:15)
		[
			[3, 6],
			[5, 12],
			[2, 10],
		],
	]

	// Create games for each season
	for (const season of seasons) {
		const seasonYear = season.dateStart.toDate().getFullYear()
		const seasonTeams = teams.filter((team) => team.season.id === season.id)

		if (seasonTeams.length !== 12) {
			console.log(
				`   Expected 12 teams in ${season.name}, found ${seasonTeams.length}, skipping game creation`
			)
			continue
		}

		const gameDates = getGameDates(season.dateStart, season.dateEnd)
		console.log(
			`   Creating games for ${season.name} - ${gameDates.length} Saturday dates (7-week season)...`
		)

		// Determine if games are historical (completed) or future based on season status
		const isHistorical = season.status === 'historical'

		// Track games per team to ensure equal distribution
		const teamGameCount = new Map()
		seasonTeams.forEach((team) => teamGameCount.set(team.id, 0))

		// Create games for each date (7 weeks total)
		for (let dateIndex = 0; dateIndex < gameDates.length; dateIndex++) {
			const dateStr = gameDates[dateIndex]

			// First 5 weeks are regular games, last 2 weeks are playoff games
			const isPlayoff = dateIndex >= 5 // Weeks 6 and 7 are playoffs (indices 5 and 6)
			const weekNumber = dateIndex + 1

			if (!isPlayoff) {
				// Regular season games (weeks 1-5) - use predefined schedule
				const weekSchedule = regularSeasonSchedule[dateIndex]

				for (
					let roundIndex = 0;
					roundIndex < weekSchedule.length;
					roundIndex++
				) {
					const round = weekSchedule[roundIndex]
					const timeSlot = gameTimes[roundIndex]

					for (let fieldIndex = 0; fieldIndex < round.length; fieldIndex++) {
						const [homeNum, awayNum] = round[fieldIndex]
						const field = fieldIndex + 1

						const homeTeam = seasonTeams[homeNum - 1]
						const awayTeam = seasonTeams[awayNum - 1]

						if (!homeTeam || !awayTeam) continue

						// Create game date/time
						const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

						let gameData
						if (isHistorical) {
							const scores = generateGameScores()
							gameData = {
								away: createRef(Collections.TEAMS, awayTeam.id),
								awayScore: scores.awayScore,
								date: gameDateTime,
								field: field,
								home: createRef(Collections.TEAMS, homeTeam.id),
								homeScore: scores.homeScore,
								season: createRef(Collections.SEASONS, season.id),
								type: GameType.REGULAR,
							}
						} else {
							gameData = {
								away: createRef(Collections.TEAMS, awayTeam.id),
								awayScore: null,
								date: gameDateTime,
								field: field,
								home: createRef(Collections.TEAMS, homeTeam.id),
								homeScore: null,
								season: createRef(Collections.SEASONS, season.id),
								type: GameType.REGULAR,
							}
						}

						const docRef = await db.collection(Collections.GAMES).add(gameData)
						const game = { id: docRef.id, ...gameData }
						games.push(game)

						// Update team game counts
						teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
						teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

						if (isHistorical) {
							console.log(
								`     Created historical Week ${weekNumber} regular game: ${homeTeam.name} ${game.homeScore}-${game.awayScore} ${awayTeam.name} - ${dateStr} ${timeSlot} Field ${field}`
							)
						} else {
							console.log(
								`     Created future Week ${weekNumber} regular game: ${homeTeam.name} vs ${awayTeam.name} - ${dateStr} ${timeSlot} Field ${field}`
							)
						}
					}
				}
			} else if (weekNumber === 6) {
				// Week 6: Pool play based on regular season seeding
				if (isHistorical) {
					// Calculate team seedings from regular season results
					const regularSeasonGames = games.filter(
						(g) => g.season.id === season.id && g.type === GameType.REGULAR
					)
					const standings = calculateTeamStandings(
						seasonTeams,
						regularSeasonGames
					)

					console.log(`     Regular season standings for ${season.name}:`)
					standings.forEach((teamStats, index) => {
						console.log(
							`       ${index + 1}. ${teamStats.team.name} (${teamStats.wins}-${teamStats.losses}, +${teamStats.pointDifferential})`
						)
					})

					// Create Week 6 pool play games based on seedings
					for (
						let roundIndex = 0;
						roundIndex < week6Schedule.length;
						roundIndex++
					) {
						const round = week6Schedule[roundIndex]
						const timeSlot = gameTimes[roundIndex]

						for (let fieldIndex = 0; fieldIndex < round.length; fieldIndex++) {
							const [seed1, seed2] = round[fieldIndex]
							const field = fieldIndex + 1

							const homeTeam = standings[seed1 - 1].team
							const awayTeam = standings[seed2 - 1].team

							// Create game date/time
							const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

							const scores = generateGameScores()
							const gameData = {
								away: createRef(Collections.TEAMS, awayTeam.id),
								awayScore: scores.awayScore,
								date: gameDateTime,
								field: field,
								home: createRef(Collections.TEAMS, homeTeam.id),
								homeScore: scores.homeScore,
								season: createRef(Collections.SEASONS, season.id),
								type: GameType.PLAYOFF,
							}

							const docRef = await db
								.collection(Collections.GAMES)
								.add(gameData)
							const game = { id: docRef.id, ...gameData }
							games.push(game)

							teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
							teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

							console.log(
								`     Created Week 6 pool play: Seed ${seed1} ${homeTeam.name} ${game.homeScore}-${game.awayScore} Seed ${seed2} ${awayTeam.name} - ${timeSlot} Field ${field}`
							)
						}
					}
				} else {
					// Future season - create games with null team references
					for (
						let roundIndex = 0;
						roundIndex < week6Schedule.length;
						roundIndex++
					) {
						const timeSlot = gameTimes[roundIndex]

						for (let fieldIndex = 0; fieldIndex < 3; fieldIndex++) {
							const field = fieldIndex + 1
							const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

							const gameData = {
								away: null,
								awayScore: null,
								date: gameDateTime,
								field: field,
								home: null,
								homeScore: null,
								season: createRef(Collections.SEASONS, season.id),
								type: GameType.PLAYOFF,
							}

							const docRef = await db
								.collection(Collections.GAMES)
								.add(gameData)
							const game = { id: docRef.id, ...gameData }
							games.push(game)

							console.log(
								`     Created future Week 6 playoff game: TBD vs TBD - ${timeSlot} Field ${field}`
							)
						}
					}
				}
			} else if (weekNumber === 7) {
				// Week 7: Championship bracket based on pool play results
				if (isHistorical) {
					// Get Week 6 playoff games and calculate pool standings
					const week6Games = games.filter(
						(g) =>
							g.season.id === season.id &&
							g.type === GameType.PLAYOFF &&
							g.date.toDate().getTime() < new Date(dateStr).getTime()
					)

					// Calculate regular season standings for pool assignments
					const regularSeasonGames = games.filter(
						(g) => g.season.id === season.id && g.type === GameType.REGULAR
					)
					const standings = calculateTeamStandings(
						seasonTeams,
						regularSeasonGames
					)

					// Create pools based on seeding
					const pools = [
						[standings[0].team, standings[7].team, standings[8].team], // Pool 1: Seeds 1, 8, 9
						[standings[1].team, standings[6].team, standings[9].team], // Pool 2: Seeds 2, 7, 10
						[standings[2].team, standings[5].team, standings[10].team], // Pool 3: Seeds 3, 6, 11
						[standings[3].team, standings[4].team, standings[11].team], // Pool 4: Seeds 4, 5, 12
					]

					// Calculate pool standings
					const poolStandings = pools.map((poolTeams, poolIndex) => {
						const poolGames = week6Games.filter((game) =>
							poolTeams.some(
								(team) => team.id === game.home.id || team.id === game.away.id
							)
						)
						const poolResults = calculatePoolStandings(poolTeams, poolGames)
						console.log(`     Pool ${poolIndex + 1} results:`)
						poolResults.forEach((teamStats, index) => {
							console.log(
								`       ${index + 1}. ${teamStats.team.name} (${teamStats.wins}-${teamStats.losses}, +${teamStats.pointDifferential})`
							)
						})
						return poolResults
					})

					// Create Week 7 games
					// Round 1: Pool 1 vs Pool 4
					const round1Games = []
					for (let i = 0; i < 3; i++) {
						const homeTeam = poolStandings[0][i].team // Pool 1
						const awayTeam = poolStandings[3][i].team // Pool 4
						const gameDateTime = createDate(`${dateStr}T${gameTimes[0]}:00`)

						const scores = generateGameScores()
						const gameData = {
							away: createRef(Collections.TEAMS, awayTeam.id),
							awayScore: scores.awayScore,
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, homeTeam.id),
							homeScore: scores.homeScore,
							season: createRef(Collections.SEASONS, season.id),
							type: GameType.PLAYOFF,
						}

						const docRef = await db.collection(Collections.GAMES).add(gameData)
						const game = { id: docRef.id, ...gameData }
						games.push(game)
						round1Games.push(game)

						teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
						teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

						console.log(
							`     Created Week 7 Round 1: ${homeTeam.name} ${game.homeScore}-${game.awayScore} ${awayTeam.name} - ${gameTimes[0]} Field ${i + 1}`
						)
					}

					// Round 2: Pool 2 vs Pool 3
					const round2Games = []
					for (let i = 0; i < 3; i++) {
						const homeTeam = poolStandings[1][i].team // Pool 2
						const awayTeam = poolStandings[2][i].team // Pool 3
						const gameDateTime = createDate(`${dateStr}T${gameTimes[1]}:00`)

						const scores = generateGameScores()
						const gameData = {
							away: createRef(Collections.TEAMS, awayTeam.id),
							awayScore: scores.awayScore,
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, homeTeam.id),
							homeScore: scores.homeScore,
							season: createRef(Collections.SEASONS, season.id),
							type: GameType.PLAYOFF,
						}

						const docRef = await db.collection(Collections.GAMES).add(gameData)
						const game = { id: docRef.id, ...gameData }
						games.push(game)
						round2Games.push(game)

						teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
						teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

						console.log(
							`     Created Week 7 Round 2: ${homeTeam.name} ${game.homeScore}-${game.awayScore} ${awayTeam.name} - ${gameTimes[1]} Field ${i + 1}`
						)
					}

					// Round 3: Losers bracket
					for (let i = 0; i < 3; i++) {
						const round1Game = round1Games[i]
						const round2Game = round2Games[i]

						const round1Loser =
							round1Game.homeScore > round1Game.awayScore
								? seasonTeams.find((t) => t.id === round1Game.away.id)
								: seasonTeams.find((t) => t.id === round1Game.home.id)

						const round2Loser =
							round2Game.homeScore > round2Game.awayScore
								? seasonTeams.find((t) => t.id === round2Game.away.id)
								: seasonTeams.find((t) => t.id === round2Game.home.id)

						const gameDateTime = createDate(`${dateStr}T${gameTimes[2]}:00`)

						const scores = generateGameScores()
						const gameData = {
							away: createRef(Collections.TEAMS, round2Loser.id),
							awayScore: scores.awayScore,
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, round1Loser.id),
							homeScore: scores.homeScore,
							season: createRef(Collections.SEASONS, season.id),
							type: GameType.PLAYOFF,
						}

						const docRef = await db.collection(Collections.GAMES).add(gameData)
						const game = { id: docRef.id, ...gameData }
						games.push(game)

						teamGameCount.set(
							round1Loser.id,
							teamGameCount.get(round1Loser.id) + 1
						)
						teamGameCount.set(
							round2Loser.id,
							teamGameCount.get(round2Loser.id) + 1
						)

						console.log(
							`     Created Week 7 Round 3: ${round1Loser.name} ${game.homeScore}-${game.awayScore} ${round2Loser.name} - ${gameTimes[2]} Field ${i + 1}`
						)
					}

					// Round 4: Winners bracket
					for (let i = 0; i < 3; i++) {
						const round1Game = round1Games[i]
						const round2Game = round2Games[i]

						const round1Winner =
							round1Game.homeScore > round1Game.awayScore
								? seasonTeams.find((t) => t.id === round1Game.home.id)
								: seasonTeams.find((t) => t.id === round1Game.away.id)

						const round2Winner =
							round2Game.homeScore > round2Game.awayScore
								? seasonTeams.find((t) => t.id === round2Game.home.id)
								: seasonTeams.find((t) => t.id === round2Game.away.id)

						const gameDateTime = createDate(`${dateStr}T${gameTimes[3]}:00`)

						const scores = generateGameScores()
						const gameData = {
							away: createRef(Collections.TEAMS, round2Winner.id),
							awayScore: scores.awayScore,
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, round1Winner.id),
							homeScore: scores.homeScore,
							season: createRef(Collections.SEASONS, season.id),
							type: GameType.PLAYOFF,
						}

						const docRef = await db.collection(Collections.GAMES).add(gameData)
						const game = { id: docRef.id, ...gameData }
						games.push(game)

						teamGameCount.set(
							round1Winner.id,
							teamGameCount.get(round1Winner.id) + 1
						)
						teamGameCount.set(
							round2Winner.id,
							teamGameCount.get(round2Winner.id) + 1
						)

						console.log(
							`     Created Week 7 Round 4: ${round1Winner.name} ${game.homeScore}-${game.awayScore} ${round2Winner.name} - ${gameTimes[3]} Field ${i + 1}`
						)
					}
				} else {
					// Future season - create games with null team references
					for (let roundIndex = 0; roundIndex < 4; roundIndex++) {
						const timeSlot = gameTimes[roundIndex]

						for (let fieldIndex = 0; fieldIndex < 3; fieldIndex++) {
							const field = fieldIndex + 1
							const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

							const gameData = {
								away: null,
								awayScore: null,
								date: gameDateTime,
								field: field,
								home: null,
								homeScore: null,
								season: createRef(Collections.SEASONS, season.id),
								type: GameType.PLAYOFF,
							}

							const docRef = await db
								.collection(Collections.GAMES)
								.add(gameData)
							const game = { id: docRef.id, ...gameData }
							games.push(game)

							console.log(
								`     Created future Week 7 playoff game: TBD vs TBD - ${timeSlot} Field ${field}`
							)
						}
					}
				}
			}
		}

		// Log game distribution per team
		console.log(`   Game distribution for ${season.name} (7-week season):`)
		seasonTeams.forEach((team) => {
			const gameCount = teamGameCount.get(team.id)
			console.log(`     ${team.name}: ${gameCount} games`)
		})
	}

	// Save all games to Firestore - games are already saved individually above
	console.log(
		`   Successfully created ${games.length} games across all seasons`
	)
	return games
}

/**
 * Creates games for a specific week of a specific season
 */
async function createGamesForWeek(seasonName, weekNumber, options = {}) {
	console.log(`🏒 Creating games for Week ${weekNumber} of ${seasonName}...`)

	const { onlyFutureGames = false } = options

	// Get the season
	const seasonSnapshot = await db
		.collection(Collections.SEASONS)
		.where('name', '==', seasonName)
		.limit(1)
		.get()

	if (seasonSnapshot.empty) {
		throw new Error(`Season "${seasonName}" not found`)
	}

	const seasonDoc = seasonSnapshot.docs[0]
	const season = { id: seasonDoc.id, ...seasonDoc.data() }
	const isHistorical = season.status === 'historical'

	// Get teams for this season
	const teamsSnapshot = await db
		.collection(Collections.TEAMS)
		.where('season', '==', seasonDoc.ref)
		.get()

	const seasonTeams = teamsSnapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}))

	if (seasonTeams.length !== 12) {
		throw new Error(
			`Expected 12 teams in ${seasonName}, found ${seasonTeams.length}`
		)
	}

	// Calculate game dates
	const gameDates = getGameDates(season.dateStart, season.dateEnd)
	if (weekNumber > gameDates.length) {
		throw new Error(
			`Week ${weekNumber} exceeds available dates (${gameDates.length} weeks)`
		)
	}

	const dateStr = gameDates[weekNumber - 1]
	const isPlayoff = weekNumber >= 6

	// Game times
	const gameTimes = ['18:00', '18:45', '19:30', '20:15']

	const games = []
	const teamGameCount = new Map()
	seasonTeams.forEach((team) => teamGameCount.set(team.id, 0))

	if (!isPlayoff) {
		// Regular season games (weeks 1-5)
		const weekSchedule = getRegularSeasonSchedule()[weekNumber - 1]

		for (let roundIndex = 0; roundIndex < weekSchedule.length; roundIndex++) {
			const round = weekSchedule[roundIndex]
			const timeSlot = gameTimes[roundIndex]

			for (let fieldIndex = 0; fieldIndex < round.length; fieldIndex++) {
				const [homeNum, awayNum] = round[fieldIndex]
				const field = fieldIndex + 1

				const homeTeam = seasonTeams[homeNum - 1]
				const awayTeam = seasonTeams[awayNum - 1]

				if (!homeTeam || !awayTeam) continue

				const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

				let gameData
				if (isHistorical && !onlyFutureGames) {
					const scores = generateGameScores()
					gameData = {
						away: createRef(Collections.TEAMS, awayTeam.id),
						awayScore: scores.awayScore,
						date: gameDateTime,
						field: field,
						home: createRef(Collections.TEAMS, homeTeam.id),
						homeScore: scores.homeScore,
						season: createRef(Collections.SEASONS, season.id),
						type: GameType.REGULAR,
					}
				} else {
					gameData = {
						away: createRef(Collections.TEAMS, awayTeam.id),
						awayScore: null,
						date: gameDateTime,
						field: field,
						home: createRef(Collections.TEAMS, homeTeam.id),
						homeScore: null,
						season: createRef(Collections.SEASONS, season.id),
						type: GameType.REGULAR,
					}
				}

				const docRef = await db.collection(Collections.GAMES).add(gameData)
				const game = { id: docRef.id, ...gameData }
				games.push(game)

				teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
				teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

				const scoreInfo =
					gameData.homeScore !== null
						? `${homeTeam.name} ${gameData.homeScore}-${gameData.awayScore} ${awayTeam.name}`
						: `${homeTeam.name} vs ${awayTeam.name}`

				console.log(
					`     Created Week ${weekNumber} regular game: ${scoreInfo} - ${dateStr} ${timeSlot} Field ${field}`
				)
			}
		}
	} else if (weekNumber === 6) {
		// Week 6: Pool play based on regular season seeding
		if (isHistorical && !onlyFutureGames) {
			// Get regular season results to calculate standings
			const regularSeasonGames = await getRegularSeasonGames(season.id)
			const standings = calculateTeamStandings(seasonTeams, regularSeasonGames)

			console.log(`     Regular season standings for ${seasonName}:`)
			standings.forEach((teamStats, index) => {
				console.log(
					`       ${index + 1}. ${teamStats.team.name} (${teamStats.wins}-${teamStats.losses}, +${teamStats.pointDifferential})`
				)
			})

			// Create Week 6 pool play games based on seedings
			const week6Schedule = getWeek6Schedule()
			for (
				let roundIndex = 0;
				roundIndex < week6Schedule.length;
				roundIndex++
			) {
				const round = week6Schedule[roundIndex]
				const timeSlot = gameTimes[roundIndex]

				for (let fieldIndex = 0; fieldIndex < round.length; fieldIndex++) {
					const [seed1, seed2] = round[fieldIndex]
					const field = fieldIndex + 1

					const homeTeam = standings[seed1 - 1].team
					const awayTeam = standings[seed2 - 1].team

					const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

					const scores = generateGameScores()
					const gameData = {
						away: createRef(Collections.TEAMS, awayTeam.id),
						awayScore: scores.awayScore,
						date: gameDateTime,
						field: field,
						home: createRef(Collections.TEAMS, homeTeam.id),
						homeScore: scores.homeScore,
						season: createRef(Collections.SEASONS, season.id),
						type: GameType.PLAYOFF,
					}

					const docRef = await db.collection(Collections.GAMES).add(gameData)
					const game = { id: docRef.id, ...gameData }
					games.push(game)

					teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
					teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

					console.log(
						`     Created Week 6 pool play: Seed ${seed1} ${homeTeam.name} ${game.homeScore}-${game.awayScore} Seed ${seed2} ${awayTeam.name} - ${timeSlot} Field ${field}`
					)
				}
			}
		} else {
			// Future season or only future games - create TBD games
			const week6Schedule = getWeek6Schedule()
			for (
				let roundIndex = 0;
				roundIndex < week6Schedule.length;
				roundIndex++
			) {
				const timeSlot = gameTimes[roundIndex]

				for (let fieldIndex = 0; fieldIndex < 3; fieldIndex++) {
					const field = fieldIndex + 1
					const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

					const gameData = {
						away: null,
						awayScore: null,
						date: gameDateTime,
						field: field,
						home: null,
						homeScore: null,
						season: createRef(Collections.SEASONS, season.id),
						type: GameType.PLAYOFF,
					}

					const docRef = await db.collection(Collections.GAMES).add(gameData)
					const game = { id: docRef.id, ...gameData }
					games.push(game)

					console.log(
						`     Created future Week 6 playoff game: TBD vs TBD - ${timeSlot} Field ${field}`
					)
				}
			}
		}
	} else if (weekNumber === 7) {
		// Week 7: Championship bracket
		if (isHistorical && !onlyFutureGames) {
			// Get Week 6 results to determine bracket
			const week6Games = await getWeekGames(season.id, 6)
			const bracket = await calculateChampionshipBracket(
				seasonTeams,
				week6Games,
				season.id
			)

			// Create championship games using the proper bracket logic
			await createChampionshipGamesFromBracket(
				season,
				dateStr,
				gameTimes,
				bracket,
				games,
				teamGameCount
			)
		} else {
			// Future games - create TBD championship games
			await createFutureChampionshipGames(season, dateStr, gameTimes, games)
		}
	}

	console.log(`   ✅ Created ${games.length} games for Week ${weekNumber}`)
	return games
}

/**
 * Helper function to get regular season games for standings calculation
 */
async function getRegularSeasonGames(seasonId) {
	const gamesSnapshot = await db
		.collection(Collections.GAMES)
		.where('season', '==', createRef(Collections.SEASONS, seasonId))
		.where('type', '==', GameType.REGULAR)
		.get()

	return gamesSnapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}))
}

/**
 * Helper function to get games for a specific week
 */
async function getWeekGames(seasonId, weekNumber) {
	// This would need to be implemented based on how you want to identify weeks
	// For now, a simplified version
	const seasonRef = createRef(Collections.SEASONS, seasonId)
	const seasonDoc = await seasonRef.get()
	const season = seasonDoc.data()

	const gameDates = getGameDates(season.dateStart, season.dateEnd)
	const targetDate = gameDates[weekNumber - 1]

	const startOfDay = createDate(`${targetDate}T00:00:00`)
	const endOfDay = createDate(`${targetDate}T23:59:59`)

	const gamesSnapshot = await db
		.collection(Collections.GAMES)
		.where('season', '==', seasonRef)
		.where('date', '>=', startOfDay)
		.where('date', '<=', endOfDay)
		.get()

	return gamesSnapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}))
}

/**
 * Extract regular season schedule to separate function
 */
function getRegularSeasonSchedule() {
	return [
		// Week 1
		[
			// Round 1 (18:00)
			[
				[1, 4],
				[2, 5],
				[3, 6],
			],
			// Round 2 (18:45)
			[
				[1, 5],
				[2, 6],
				[3, 4],
			],
			// Round 3 (19:30)
			[
				[7, 10],
				[8, 11],
				[9, 12],
			],
			// Round 4 (20:15)
			[
				[7, 11],
				[8, 12],
				[9, 10],
			],
		],
		// Week 2
		[
			// Round 1 (18:00)
			[
				[11, 3],
				[12, 4],
				[1, 2],
			],
			// Round 2 (18:45)
			[
				[11, 4],
				[12, 2],
				[1, 3],
			],
			// Round 3 (19:30)
			[
				[5, 9],
				[6, 10],
				[7, 8],
			],
			// Round 4 (20:15)
			[
				[5, 10],
				[6, 8],
				[7, 9],
			],
		],
		// Week 3
		[
			// Round 1 (18:00)
			[
				[9, 1],
				[10, 2],
				[11, 12],
			],
			// Round 2 (18:45)
			[
				[9, 2],
				[10, 12],
				[11, 1],
			],
			// Round 3 (19:30)
			[
				[3, 7],
				[4, 8],
				[5, 6],
			],
			// Round 4 (20:15)
			[
				[3, 8],
				[4, 6],
				[5, 7],
			],
		],
		// Week 4
		[
			// Round 1 (18:00)
			[
				[1, 10],
				[2, 8],
				[4, 7],
			],
			// Round 2 (18:45)
			[
				[1, 8],
				[2, 7],
				[4, 10],
			],
			// Round 3 (19:30)
			[
				[3, 9],
				[5, 12],
				[6, 11],
			],
			// Round 4 (20:15)
			[
				[3, 12],
				[5, 11],
				[6, 9],
			],
		],
		// Week 5
		[
			// Round 1 (18:00)
			[
				[1, 6],
				[2, 3],
				[4, 5],
			],
			// Round 2 (18:45)
			[
				[6, 12],
				[8, 9],
				[10, 11],
			],
			// Round 3 (19:30)
			[
				[1, 7],
				[3, 5],
				[2, 4],
			],
			// Round 4 (20:15)
			[
				[7, 12],
				[9, 11],
				[8, 10],
			],
		],
	]
}

/**
 * Extract Week 6 schedule to separate function
 */
function getWeek6Schedule() {
	return [
		// Round 1 (18:00)
		[
			[1, 8],
			[3, 11],
			[7, 10],
		],
		// Round 2 (18:45)
		[
			[1, 9],
			[4, 5],
			[6, 11],
		],
		// Round 3 (19:30)
		[
			[8, 9],
			[4, 12],
			[2, 7],
		],
		// Round 4 (20:15)
		[
			[3, 6],
			[5, 12],
			[2, 10],
		],
	]
}

/**
 * Helper function to get game dates within season range
 */
function getGameDates(startDate, endDate) {
	const saturdays = []
	// Convert Firebase Timestamps to JavaScript Date objects
	const start = startDate.toDate()
	const end = endDate.toDate()

	// Start from the first Saturday on or after the start date
	const current = new Date(start)
	const daysUntilSaturday = (6 - current.getDay()) % 7
	current.setDate(current.getDate() + daysUntilSaturday)

	// Collect Saturdays until we reach the end date or have 7 dates
	while (current <= end && saturdays.length < 7) {
		const year = current.getFullYear()
		const month = (current.getMonth() + 1).toString().padStart(2, '0')
		const day = current.getDate().toString().padStart(2, '0')
		saturdays.push(`${year}-${month}-${day}`)

		// Move to next Saturday
		current.setDate(current.getDate() + 7)
	}

	return saturdays
}

/**
 * Helper function to generate random scores (0-25) ensuring no ties
 */
function generateGameScores() {
	let homeScore, awayScore
	do {
		homeScore = Math.floor(Math.random() * 26)
		awayScore = Math.floor(Math.random() * 26)
	} while (homeScore === awayScore) // Ensure no ties

	return { homeScore, awayScore }
}

/**
 * Create championship games for Week 7 based on proper bracket from pool results
 */
async function createChampionshipGamesFromBracket(
	season,
	dateStr,
	gameTimes,
	bracket,
	games,
	teamGameCount
) {
	const { poolStandings } = bracket

	// Round 1: Pool 1 vs Pool 4
	const round1Games = []
	for (let i = 0; i < 3; i++) {
		const homeTeam = poolStandings[0][i].team // Pool 1
		const awayTeam = poolStandings[3][i].team // Pool 4
		const gameDateTime = createDate(`${dateStr}T${gameTimes[0]}:00`)

		const scores = generateGameScores()
		const gameData = {
			away: createRef(Collections.TEAMS, awayTeam.id),
			awayScore: scores.awayScore,
			date: gameDateTime,
			field: i + 1,
			home: createRef(Collections.TEAMS, homeTeam.id),
			homeScore: scores.homeScore,
			season: createRef(Collections.SEASONS, season.id),
			type: GameType.PLAYOFF,
		}

		const docRef = await db.collection(Collections.GAMES).add(gameData)
		const game = { id: docRef.id, ...gameData }
		games.push(game)
		round1Games.push(game)

		teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
		teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

		console.log(
			`     Created Week 7 Round 1: ${homeTeam.name} ${game.homeScore}-${game.awayScore} ${awayTeam.name} - ${gameTimes[0]} Field ${i + 1}`
		)
	}

	// Round 2: Pool 2 vs Pool 3
	const round2Games = []
	for (let i = 0; i < 3; i++) {
		const homeTeam = poolStandings[1][i].team // Pool 2
		const awayTeam = poolStandings[2][i].team // Pool 3
		const gameDateTime = createDate(`${dateStr}T${gameTimes[1]}:00`)

		const scores = generateGameScores()
		const gameData = {
			away: createRef(Collections.TEAMS, awayTeam.id),
			awayScore: scores.awayScore,
			date: gameDateTime,
			field: i + 1,
			home: createRef(Collections.TEAMS, homeTeam.id),
			homeScore: scores.homeScore,
			season: createRef(Collections.SEASONS, season.id),
			type: GameType.PLAYOFF,
		}

		const docRef = await db.collection(Collections.GAMES).add(gameData)
		const game = { id: docRef.id, ...gameData }
		games.push(game)
		round2Games.push(game)

		teamGameCount.set(homeTeam.id, teamGameCount.get(homeTeam.id) + 1)
		teamGameCount.set(awayTeam.id, teamGameCount.get(awayTeam.id) + 1)

		console.log(
			`     Created Week 7 Round 2: ${homeTeam.name} ${game.homeScore}-${game.awayScore} ${awayTeam.name} - ${gameTimes[1]} Field ${i + 1}`
		)
	}

	// Round 3: Losers bracket
	for (let i = 0; i < 3; i++) {
		const round1Game = round1Games[i]
		const round2Game = round2Games[i]

		// Find loser teams by looking up the teams from the game references
		const round1HomeTeam = poolStandings[0][i].team
		const round1AwayTeam = poolStandings[3][i].team
		const round1Loser =
			round1Game.homeScore > round1Game.awayScore
				? round1AwayTeam
				: round1HomeTeam

		const round2HomeTeam = poolStandings[1][i].team
		const round2AwayTeam = poolStandings[2][i].team
		const round2Loser =
			round2Game.homeScore > round2Game.awayScore
				? round2AwayTeam
				: round2HomeTeam

		const gameDateTime = createDate(`${dateStr}T${gameTimes[2]}:00`)

		const scores = generateGameScores()
		const gameData = {
			away: createRef(Collections.TEAMS, round2Loser.id),
			awayScore: scores.awayScore,
			date: gameDateTime,
			field: i + 1,
			home: createRef(Collections.TEAMS, round1Loser.id),
			homeScore: scores.homeScore,
			season: createRef(Collections.SEASONS, season.id),
			type: GameType.PLAYOFF,
		}

		const docRef = await db.collection(Collections.GAMES).add(gameData)
		const game = { id: docRef.id, ...gameData }
		games.push(game)

		teamGameCount.set(round1Loser.id, teamGameCount.get(round1Loser.id) + 1)
		teamGameCount.set(round2Loser.id, teamGameCount.get(round2Loser.id) + 1)

		console.log(
			`     Created Week 7 Round 3: ${round1Loser.name} ${game.homeScore}-${game.awayScore} ${round2Loser.name} - ${gameTimes[2]} Field ${i + 1}`
		)
	}

	// Round 4: Winners bracket
	for (let i = 0; i < 3; i++) {
		const round1Game = round1Games[i]
		const round2Game = round2Games[i]

		// Find winner teams
		const round1HomeTeam = poolStandings[0][i].team
		const round1AwayTeam = poolStandings[3][i].team
		const round1Winner =
			round1Game.homeScore > round1Game.awayScore
				? round1HomeTeam
				: round1AwayTeam

		const round2HomeTeam = poolStandings[1][i].team
		const round2AwayTeam = poolStandings[2][i].team
		const round2Winner =
			round2Game.homeScore > round2Game.awayScore
				? round2HomeTeam
				: round2AwayTeam

		const gameDateTime = createDate(`${dateStr}T${gameTimes[3]}:00`)

		const scores = generateGameScores()
		const gameData = {
			away: createRef(Collections.TEAMS, round2Winner.id),
			awayScore: scores.awayScore,
			date: gameDateTime,
			field: i + 1,
			home: createRef(Collections.TEAMS, round1Winner.id),
			homeScore: scores.homeScore,
			season: createRef(Collections.SEASONS, season.id),
			type: GameType.PLAYOFF,
		}

		const docRef = await db.collection(Collections.GAMES).add(gameData)
		const game = { id: docRef.id, ...gameData }
		games.push(game)

		teamGameCount.set(round1Winner.id, teamGameCount.get(round1Winner.id) + 1)
		teamGameCount.set(round2Winner.id, teamGameCount.get(round2Winner.id) + 1)

		console.log(
			`     Created Week 7 Round 4: ${round1Winner.name} ${game.homeScore}-${game.awayScore} ${round2Winner.name} - ${gameTimes[3]} Field ${i + 1}`
		)
	}
}

/**
 * Create future championship games for Week 7
 */
async function createFutureChampionshipGames(
	season,
	dateStr,
	gameTimes,
	games
) {
	const championshipRounds = [
		{ name: 'Lower Bracket', gameCount: 2 },
		{ name: 'Middle Bracket', gameCount: 2 },
		{ name: 'Upper Bracket', gameCount: 2 },
		{ name: 'Championship', gameCount: 1 },
	]

	for (
		let roundIndex = 0;
		roundIndex < championshipRounds.length;
		roundIndex++
	) {
		const round = championshipRounds[roundIndex]
		const timeSlot = gameTimes[roundIndex]

		for (let gameIndex = 0; gameIndex < round.gameCount; gameIndex++) {
			const field = gameIndex + 1
			const gameDateTime = createDate(`${dateStr}T${timeSlot}:00`)

			const gameData = {
				away: null,
				awayScore: null,
				date: gameDateTime,
				field: field,
				home: null,
				homeScore: null,
				season: createRef(Collections.SEASONS, season.id),
				type: GameType.PLAYOFF,
			}

			const docRef = await db.collection(Collections.GAMES).add(gameData)
			const game = { id: docRef.id, ...gameData }
			games.push(game)

			console.log(
				`     Created future Week 7 ${round.name} game: TBD vs TBD - ${timeSlot} Field ${field}`
			)
		}
	}
}

/**
 * Calculate championship bracket from Week 6 pool results
 */
async function calculateChampionshipBracket(seasonTeams, week6Games, seasonId) {
	// Get regular season games to establish initial seeding
	const regularSeasonGames = await getRegularSeasonGames(seasonId)
	const standings = calculateTeamStandings(seasonTeams, regularSeasonGames)

	console.log(`     Regular season standings used for pool assignments:`)
	standings.forEach((teamStats, index) => {
		console.log(
			`       ${index + 1}. ${teamStats.team.name} (${teamStats.wins}-${teamStats.losses}, +${teamStats.pointDifferential})`
		)
	})

	// Create pools based on seeding (same as original logic)
	const pools = [
		[standings[0].team, standings[7].team, standings[8].team], // Pool 1: Seeds 1, 8, 9
		[standings[1].team, standings[6].team, standings[9].team], // Pool 2: Seeds 2, 7, 10
		[standings[2].team, standings[5].team, standings[10].team], // Pool 3: Seeds 3, 6, 11
		[standings[3].team, standings[4].team, standings[11].team], // Pool 4: Seeds 4, 5, 12
	]

	// Calculate pool standings from Week 6 results
	const poolStandings = pools.map((poolTeams, poolIndex) => {
		const poolGames = week6Games.filter((game) =>
			poolTeams.some(
				(team) => team.id === game.home.id || team.id === game.away.id
			)
		)
		const poolResults = calculatePoolStandings(poolTeams, poolGames)
		console.log(`     Pool ${poolIndex + 1} results:`)
		poolResults.forEach((teamStats, index) => {
			console.log(
				`       ${index + 1}. ${teamStats.team.name} (${teamStats.wins}-${teamStats.losses}, +${teamStats.pointDifferential})`
			)
		})
		return poolResults
	})

	return { pools, poolStandings, regularSeasonStandings: standings }
}

/**
 * Helper function to calculate pool standings from pool play games
 */
function calculatePoolStandings(poolTeams, poolGames) {
	const teamStats = new Map()

	// Initialize stats for pool teams
	poolTeams.forEach((team) => {
		teamStats.set(team.id, {
			team: team,
			wins: 0,
			losses: 0,
			pointsFor: 0,
			pointsAgainst: 0,
			pointDifferential: 0,
			headToHead: new Map(),
		})
	})

	// Calculate stats from pool games
	poolGames.forEach((game) => {
		if (game.homeScore !== null && game.awayScore !== null) {
			const homeStats = teamStats.get(game.home.id)
			const awayStats = teamStats.get(game.away.id)

			if (homeStats && awayStats) {
				homeStats.pointsFor += game.homeScore
				homeStats.pointsAgainst += game.awayScore
				awayStats.pointsFor += game.awayScore
				awayStats.pointsAgainst += game.homeScore

				if (game.homeScore > game.awayScore) {
					homeStats.wins++
					awayStats.losses++
					homeStats.headToHead.set(
						game.away.id,
						(homeStats.headToHead.get(game.away.id) || 0) + 1
					)
				} else {
					// awayScore > homeScore (since ties are not allowed)
					awayStats.wins++
					homeStats.losses++
					awayStats.headToHead.set(
						game.home.id,
						(awayStats.headToHead.get(game.home.id) || 0) + 1
					)
				}
			}
		}
	})

	// Calculate point differential and sort
	teamStats.forEach((stats) => {
		stats.pointDifferential = stats.pointsFor - stats.pointsAgainst
	})

	return Array.from(teamStats.values()).sort((a, b) => {
		if (a.wins !== b.wins) return b.wins - a.wins
		if (a.pointDifferential !== b.pointDifferential)
			return b.pointDifferential - a.pointDifferential
		const aWinsVsB = a.headToHead.get(b.team.id) || 0
		const bWinsVsA = b.headToHead.get(a.team.id) || 0
		if (aWinsVsB !== bWinsVsA) return bWinsVsA - aWinsVsB
		return a.team.name.localeCompare(b.team.name)
	})
}

/**
 * Helper function to calculate team standings from regular season games
 */
function calculateTeamStandings(seasonTeams, regularSeasonGames) {
	const teamStats = new Map()

	// Initialize stats for each team
	seasonTeams.forEach((team) => {
		teamStats.set(team.id, {
			team: team,
			wins: 0,
			losses: 0,
			pointsFor: 0,
			pointsAgainst: 0,
			pointDifferential: 0,
			headToHead: new Map(), // Map of opponent team ID to wins against them
		})
	})

	// Calculate stats from regular season games
	regularSeasonGames.forEach((game) => {
		if (game.homeScore !== null && game.awayScore !== null) {
			const homeStats = teamStats.get(game.home.id)
			const awayStats = teamStats.get(game.away.id)

			homeStats.pointsFor += game.homeScore
			homeStats.pointsAgainst += game.awayScore
			awayStats.pointsFor += game.awayScore
			awayStats.pointsAgainst += game.homeScore

			// Determine winner (ties are not allowed)
			if (game.homeScore > game.awayScore) {
				homeStats.wins++
				awayStats.losses++
				// Head-to-head tracking
				homeStats.headToHead.set(
					game.away.id,
					(homeStats.headToHead.get(game.away.id) || 0) + 1
				)
			} else {
				// awayScore > homeScore (since ties are not allowed)
				awayStats.wins++
				homeStats.losses++
				// Head-to-head tracking
				awayStats.headToHead.set(
					game.home.id,
					(awayStats.headToHead.get(game.home.id) || 0) + 1
				)
			}
		}
	})

	// Calculate point differential
	teamStats.forEach((stats) => {
		stats.pointDifferential = stats.pointsFor - stats.pointsAgainst
	})

	// Sort teams by: 1) Wins (desc), 2) Point differential (desc), 3) Head-to-head (complex)
	const sortedTeams = Array.from(teamStats.values()).sort((a, b) => {
		// Primary: Most wins
		if (a.wins !== b.wins) {
			return b.wins - a.wins
		}

		// Secondary: Best point differential
		if (a.pointDifferential !== b.pointDifferential) {
			return b.pointDifferential - a.pointDifferential
		}

		// Tertiary: Head-to-head record (wins against the other team)
		const aWinsVsB = a.headToHead.get(b.team.id) || 0
		const bWinsVsA = b.headToHead.get(a.team.id) || 0
		if (aWinsVsB !== bWinsVsA) {
			return bWinsVsA - aWinsVsB // Higher wins against opponent ranks higher
		}

		// Final tiebreaker: team name (for consistency)
		return a.team.name.localeCompare(b.team.name)
	})

	return sortedTeams
}

// Function to calculate and update team placements based on Week 7 playoff results
async function updateTeamPlacements(teams, games) {
	console.log(
		'🏆 Calculating final team placements based on playoff results...'
	)

	// Group teams by season
	const teamsBySeason = new Map()
	teams.forEach((team) => {
		const seasonId = team.season.id
		if (!teamsBySeason.has(seasonId)) {
			teamsBySeason.set(seasonId, [])
		}
		teamsBySeason.get(seasonId).push(team)
	})

	// Calculate placements for each season
	for (const [seasonId, seasonTeams] of teamsBySeason) {
		console.log(`   Calculating placements for season ${seasonId}...`)

		// Get Week 7 games for this season (championship games)
		const week7Games = games.filter((game) => {
			if (game.season.id !== seasonId || game.type !== GameType.PLAYOFF) {
				return false
			}

			// Week 7 games are the second week of playoffs
			// Get all playoff games for this season and find the latest date
			const allPlayoffGames = games.filter(
				(g) => g.season.id === seasonId && g.type === GameType.PLAYOFF
			)
			const playoffDates = [
				...new Set(allPlayoffGames.map((g) => g.date.toDate().toDateString())),
			]
			playoffDates.sort((a, b) => new Date(a) - new Date(b))

			// Week 7 should be the second (last) playoff date
			const gameDate = game.date.toDate()
			return (
				playoffDates.length >= 2 && gameDate.toDateString() === playoffDates[1]
			)
		})

		if (week7Games.length === 0) {
			console.log(
				`     No Week 7 games found for season ${seasonId}, skipping placement calculation`
			)
			continue
		}

		// Initialize placement map
		const teamPlacements = new Map()

		// Process Week 7 games to determine placements
		// Round 3 games (losers bracket) - fields determine 3rd/4th, 7th/8th, 11th/12th places
		const round3Games = week7Games.filter((game) => {
			const gameTime =
				game.date.toDate().getHours() * 60 + game.date.toDate().getMinutes()
			return gameTime === 19 * 60 + 30 // 19:30 (7:30 PM)
		})

		// Round 4 games (winners bracket) - fields determine 1st/2nd, 5th/6th, 9th/10th places
		const round4Games = week7Games.filter((game) => {
			const gameTime =
				game.date.toDate().getHours() * 60 + game.date.toDate().getMinutes()
			return gameTime === 20 * 60 + 15 // 20:15 (8:15 PM)
		})

		// Process Round 3 games (3rd/4th, 7th/8th, 11th/12th places)
		round3Games.forEach((game) => {
			if (game.homeScore !== null && game.awayScore !== null) {
				const field = game.field
				let winnerPlace, loserPlace

				if (field === 1) {
					winnerPlace = 3
					loserPlace = 4
				} else if (field === 2) {
					winnerPlace = 7
					loserPlace = 8
				} else if (field === 3) {
					winnerPlace = 11
					loserPlace = 12
				}

				if (winnerPlace && loserPlace) {
					const winner =
						game.homeScore > game.awayScore ? game.home.id : game.away.id
					const loser =
						game.homeScore > game.awayScore ? game.away.id : game.home.id

					teamPlacements.set(winner, winnerPlace)
					teamPlacements.set(loser, loserPlace)
				}
			}
		})

		// Process Round 4 games (1st/2nd, 5th/6th, 9th/10th places)
		round4Games.forEach((game) => {
			if (game.homeScore !== null && game.awayScore !== null) {
				const field = game.field
				let winnerPlace, loserPlace

				if (field === 1) {
					winnerPlace = 1
					loserPlace = 2
				} else if (field === 2) {
					winnerPlace = 5
					loserPlace = 6
				} else if (field === 3) {
					winnerPlace = 9
					loserPlace = 10
				}

				if (winnerPlace && loserPlace) {
					const winner =
						game.homeScore > game.awayScore ? game.home.id : game.away.id
					const loser =
						game.homeScore > game.awayScore ? game.away.id : game.home.id

					teamPlacements.set(winner, winnerPlace)
					teamPlacements.set(loser, loserPlace)
				}
			}
		})

		// Update team documents with calculated placements
		let placementsUpdated = 0
		for (const team of seasonTeams) {
			const placement = teamPlacements.get(team.id)
			if (placement) {
				await db.collection(Collections.TEAMS).doc(team.id).update({
					placement: placement,
				})
				console.log(
					`     Updated ${team.name}: ${placement}${placement === 1 ? 'st' : placement === 2 ? 'nd' : placement === 3 ? 'rd' : 'th'} place`
				)
				placementsUpdated++
			} else {
				// For future seasons or teams that didn't make playoffs, keep placement as null
				console.log(
					`     ${team.name}: No playoff placement (future season or incomplete playoffs)`
				)
			}
		}

		console.log(
			`     Updated ${placementsUpdated} of ${seasonTeams.length} teams with final placements`
		)
	}
}

// Function to create placeholder data for future seasons (no teams or games)
async function createPlaceholderDataForFutureSeasons(seasons) {
	console.log('📅 Creating placeholder data for future seasons...')

	if (seasons.length === 0) {
		console.log('   No future seasons to create placeholders for')
		return
	}

	for (const season of seasons) {
		console.log(
			`   Future season: ${season.name} - no teams or games (for testing empty state)`
		)

		// Update season with empty teams array (already initialized as empty)
		await db.collection(Collections.SEASONS).doc(season.id).update({
			teams: [], // Ensure it's explicitly empty
		})
	}

	console.log(`   Created ${seasons.length} future season placeholders`)
}

// Run the seeding script
seedTestData().catch(console.error)
