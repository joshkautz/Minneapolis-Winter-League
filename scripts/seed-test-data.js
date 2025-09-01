#!/usr/bin/env node

/**
 * Test Data Seeding Script for Minneapolis Winter League
 *
 * This script populates the Firebase emulator with comprehensive test data
 * for development and testing purposes.
 *
 * Usage:
 * 1. Start Firebase emulators: npm run dev
 * 2. In another terminal: node scripts/seed-test-data.js
 * 3. Stop emulators to export the data
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

// Initialize Firebase Admin SDK for local emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'

const app = initializeApp({
	projectId: 'minnesota-winter-league-dev', // Use development project for emulator
})

const db = getFirestore(app)
const auth = getAuth(app)

// Collections enum - matching the app structure
const Collections = {
	GAMES: 'games',
	OFFERS: 'offers',
	PLAYERS: 'players',
	SEASONS: 'seasons',
	TEAMS: 'teams',
	WAIVERS: 'waivers',
}

// Enums matching the app structure
const OfferStatus = {
	ACCEPTED: 'accepted',
	PENDING: 'pending',
	REJECTED: 'rejected',
}

const OfferType = {
	INVITATION: 'invitation',
	REQUEST: 'request',
}

const GameType = {
	REGULAR: 'regular',
	PLAYOFF: 'playoff',
}

// Helper function to create timestamps
const createDate = (dateString) => {
	return Timestamp.fromDate(new Date(dateString))
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

async function seedTestData() {
	console.log('🌱 Starting test data seeding...')

	try {
		// Clear existing data first
		await clearCollections()

		// Get existing auth users (don't create new ones)
		const authUsers = await getExistingAuthUsers()

		// Create test data in order (dependencies matter)
		const seasons = await createSeasons()
		const players = await createPlayersFromAuth(authUsers)
		const teams = await createTeams(seasons, players)
		// Skip games, offers, and waivers for now as requested

		console.log('✅ Test data seeding completed successfully!')
		console.log('\n📊 Summary:')
		console.log(`   • ${seasons.length} seasons`)
		console.log(`   • ${players.length} players from existing auth users`)
		console.log(`   • ${teams.length} teams with alliterative names`)
		console.log('\n🎯 You can now stop the emulators to export this data.')
	} catch (error) {
		console.error('❌ Error seeding test data:', error)
		process.exit(1)
	}
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

	const seasons = [
		{
			id: generateDocId(),
			name: '1999 Fall',
			dateStart: createDate('1999-11-01'),
			dateEnd: createDate('1999-12-31'),
			registrationStart: createDate('1999-10-01'),
			registrationEnd: createDate('1999-10-31'),
			teams: [], // Will be populated after teams are created
		},
		{
			id: generateDocId(),
			name: '2000 Fall',
			dateStart: createDate('2000-11-01'),
			dateEnd: createDate('2000-12-31'),
			registrationStart: createDate('2000-10-01'),
			registrationEnd: createDate('2000-10-31'),
			teams: [],
		},
		{
			id: generateDocId(),
			name: '2025 Fall',
			dateStart: createDate('2025-11-01'),
			dateEnd: createDate('2025-12-31'),
			registrationStart: createDate('2025-10-01'),
			registrationEnd: createDate('2025-10-31'),
			teams: [],
		},
	]

	for (const season of seasons) {
		await db.collection(Collections.SEASONS).doc(season.id).set(season)
		console.log(`   Created season: ${season.name}`)
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
			id: user.uid,
			admin: false, // All non-admin as requested
			email: user.email,
			firstname: firstname,
			lastname: lastname,
			seasons: [], // Will be populated when teams are assigned
		}
	})

	for (const player of players) {
		await db.collection(Collections.PLAYERS).doc(player.id).set(player)
		console.log(`   Created player: ${player.firstname} ${player.lastname}`)
	}

	return players
}

async function createTeams(seasons, players) {
	console.log('🏒 Creating teams with alliterative names...')

	// Alliterative city/animal combinations
	const teamNames = [
		// 1999 teams
		'Anoka Alligators',
		'Bloomington Bears',
		'Chaska Cheetahs',
		'Duluth Dragons',
		'Edina Eagles',
		'Fridley Foxes',
		'Golden Valley Grizzlies',
		'Hopkins Hawks',
		'Inver Grove Iguanas',
		'Jordan Jaguars',
		'Lakeville Lions',
		'Minnetonka Moose',

		// 2000 teams
		'New Brighton Nighthawks',
		'Oakdale Otters',
		'Plymouth Panthers',
		'Richfield Raccoons',
		'Shakopee Sharks',
		'Stillwater Stallions',
		'Woodbury Wolves',
		'Apple Valley Ants',
		'Burnsville Badgers',
		'Coon Rapids Cardinals',
		'Eagan Elephants',
		'Falcon Heights Falcons',

		// 2025 teams
		'Maple Grove Mantises',
		'Roseville Ravens',
		'St. Paul Pumas',
		'White Bear Lake Whales',
		'Blaine Bison',
		'Brooklyn Park Bears',
		'Crystal Cougars',
		'Maplewood Marlins',
		'Rosemount Rhinos',
		'Savage Salamanders',
		'Victoria Vipers',
		'Wayzata Walruses',
	]

	// Some teams that carry over between seasons (for continuity)
	const continuityTeams = new Map([
		['Bloomington Bears', generateDocId()],
		['Chaska Cheetahs', generateDocId()],
		['Edina Eagles', generateDocId()],
		['Hopkins Hawks', generateDocId()],
		['Plymouth Panthers', generateDocId()],
		['Shakopee Sharks', generateDocId()],
		['Maple Grove Mantises', generateDocId()],
		['St. Paul Pumas', generateDocId()],
	])

	const teams = []
	let teamIndex = 0

	for (const season of seasons) {
		console.log(`   Creating teams for ${season.name}...`)

		const seasonTeams = []
		const placements = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

		for (let i = 0; i < 12; i++) {
			const teamName = teamNames[teamIndex]
			const teamId = generateDocId()

			// Use consistent teamId for continuity teams, otherwise generate new one
			let consistentTeamId = continuityTeams.get(teamName) || generateDocId()

			// Random registration date in October of the year before season start
			const seasonYear = parseInt(season.name.split(' ')[0])
			const registrationYear = seasonYear
			const randomDay = Math.floor(Math.random() * 31) + 1
			const registrationDate = createDate(
				`${registrationYear}-10-${randomDay.toString().padStart(2, '0')}`
			)

			// Randomly assign 3-4 players to each team
			const teamSize = Math.floor(Math.random() * 2) + 3 // 3 or 4 players
			const availablePlayers = [...players]
			shuffleArray(availablePlayers)
			const teamPlayers = availablePlayers.slice(0, teamSize)

			const roster = teamPlayers.map((player, index) => ({
				captain: index === 0, // First player is captain
				player: createRef(Collections.PLAYERS, player.id),
			}))

			const team = {
				id: teamId,
				logo: null,
				name: teamName,
				placement: placements[i],
				registered: true,
				registeredDate: registrationDate,
				roster: roster,
				season: createRef(Collections.SEASONS, season.id),
				storagePath: null,
				teamId: consistentTeamId,
			}

			teams.push(team)
			seasonTeams.push(createRef(Collections.TEAMS, teamId))
			console.log(
				`     Created team: ${teamName} (Placement: ${placements[i]})`
			)

			teamIndex++
		}

		// Update season with team references
		await db.collection(Collections.SEASONS).doc(season.id).update({
			teams: seasonTeams,
		})
	}

	// Save all teams to Firestore
	for (const team of teams) {
		await db.collection(Collections.TEAMS).doc(team.id).set(team)
	}

	// Update players with season participation
	await updatePlayerSeasonsFromTeams(players, teams)

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

async function updatePlayerSeasonsFromTeams(players, teams) {
	console.log('🔄 Updating players with season participation...')

	// Create a map of player assignments
	const playerAssignments = new Map()

	for (const team of teams) {
		for (const rosterEntry of team.roster) {
			const playerId = rosterEntry.player.id
			if (!playerAssignments.has(playerId)) {
				playerAssignments.set(playerId, [])
			}

			playerAssignments.get(playerId).push({
				banned: false,
				captain: rosterEntry.captain,
				paid: Math.random() > 0.3, // 70% chance of being paid
				season: team.season,
				signed: Math.random() > 0.2, // 80% chance of having signed waiver
				team: createRef(Collections.TEAMS, team.id),
			})
		}
	}

	// Update each player with their season participation
	for (const [playerId, seasonData] of playerAssignments) {
		await db.collection(Collections.PLAYERS).doc(playerId).update({
			seasons: seasonData,
		})
	}
}

// Run the seeding script
seedTestData().catch(console.error)
