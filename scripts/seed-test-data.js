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
import { getStorage } from 'firebase-admin/storage'

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

// Function to generate a team logo SVG and upload to Firebase Storage
async function generateAndUploadTeamLogo(teamName, teamId) {
	try {
		// Generate a color based on team name for consistency
		const colors = [
			'#FF6B6B',
			'#4ECDC4',
			'#45B7D1',
			'#96CEB4',
			'#FFEAA7',
			'#DDA0DD',
			'#98D8C8',
			'#F7DC6F',
			'#BB8FCE',
			'#85C1E9',
			'#F8C471',
			'#82E0AA',
			'#F1948A',
			'#85C1E9',
			'#D7BDE2',
		]

		const colorIndex =
			teamName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
			colors.length
		const primaryColor = colors[colorIndex]

		// Split team name into words for better layout
		const words = teamName.split(' ')
		const city = words[0] || ''
		const mascot = words.slice(1).join(' ') || ''

		// Create SVG content
		const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFFFFF;stop-opacity:1" />
    </radialGradient>
  </defs>
  
  <!-- Background -->
  <rect width="300" height="300" fill="url(#bg)" />
  
  <!-- Border -->
  <rect x="8" y="8" width="284" height="284" fill="none" stroke="#2C3E50" stroke-width="8" />
  
  <!-- Team Name -->
  <text x="150" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#2C3E50">
    ${city}
  </text>
  <text x="150" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#2C3E50">
    ${mascot}
  </text>
  
  <!-- Simple hockey puck decoration -->
  <circle cx="150" cy="220" r="15" fill="#2C3E50" />
  <circle cx="150" cy="220" r="10" fill="none" stroke="#FFFFFF" stroke-width="2" />
</svg>`

		// Convert SVG to buffer
		const buffer = Buffer.from(svgContent, 'utf8')

		// Upload to Firebase Storage
		const bucket = storage.bucket('minnesota-winter-league.appspot.com')
		const fileName = `team-logos/${teamId}.svg`
		const file = bucket.file(fileName)

		await file.save(buffer, {
			metadata: {
				contentType: 'image/svg+xml',
				metadata: {
					teamName: teamName,
					generatedAt: new Date().toISOString(),
				},
			},
		})

		// Make the file publicly readable
		await file.makePublic()

		// Get the public URL (for emulator, this will be the emulator URL)
		const publicUrl = `http://127.0.0.1:9199/v0/b/minnesota-winter-league.appspot.com/o/${encodeURIComponent(fileName)}?alt=media`

		console.log(`     Generated and uploaded logo for ${teamName}`)

		return {
			logoUrl: publicUrl,
			storagePath: fileName,
		}
	} catch (error) {
		console.error(`     Error generating logo for ${teamName}:`, error)
		return {
			logoUrl: null,
			storagePath: null,
		}
	}
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
		const games = await createGames(seasons, teams)
		// Skipping offers and waivers.

		console.log('✅ Test data seeding completed successfully!')
		console.log('\n📊 Summary:')
		console.log(`   • ${seasons.length} seasons`)
		console.log(`   • ${players.length} players from existing auth users`)
		console.log(`   • ${teams.length} teams with alliterative names`)
		console.log(`   • ${games.length} games scheduled`)
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

	const seasonsData = [
		{
			name: '1999 Fall',
			dateStart: createDate('1999-11-01'),
			dateEnd: createDate('1999-12-31'),
			registrationStart: createDate('1999-10-01'),
			registrationEnd: createDate('1999-10-31'),
			teams: [], // Will be populated after teams are created
		},
		{
			name: '2000 Fall',
			dateStart: createDate('2000-11-01'),
			dateEnd: createDate('2000-12-31'),
			registrationStart: createDate('2000-10-01'),
			registrationEnd: createDate('2000-10-31'),
			teams: [],
		},
		{
			name: '2025 Fall',
			dateStart: createDate('2025-11-01'),
			dateEnd: createDate('2025-12-31'),
			registrationStart: createDate('2025-10-01'),
			registrationEnd: createDate('2025-10-31'),
			teams: [],
		},
	]

	const seasons = []
	for (const seasonData of seasonsData) {
		const docRef = await db.collection(Collections.SEASONS).add(seasonData)
		seasons.push({ id: docRef.id, ...seasonData })
		console.log(`   Created season: ${seasonData.name}`)
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

async function createTeams(seasons, players) {
	console.log('🏒 Creating teams with alliterative names...')

	// Check if we have enough players (need 15 players per team * 12 teams = 180 players minimum per season)
	const playersNeeded = 12 * 15 // 180 players per season
	if (players.length < playersNeeded) {
		console.log(
			`   Warning: Only ${players.length} players available, but need ${playersNeeded} for full teams`
		)
		console.log('   Teams will have repeated players to fill rosters')
	}

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
		'Bloomington Bears', // Carries over from 1999
		'Plymouth Panthers',
		'Richfield Raccoons',
		'Edina Eagles', // Carries over from 1999
		'Stillwater Stallions',
		'Woodbury Wolves',
		'Hopkins Hawks', // Carries over from 1999
		'Burnsville Badgers',
		'Coon Rapids Cardinals',
		'Eagan Elephants',
		'Falcon Heights Falcons',

		// 2025 teams
		'Maple Grove Mantises',
		'Roseville Ravens',
		'Plymouth Panthers', // Carries over from 2000
		'White Bear Lake Whales',
		'Blaine Bison',
		'Brooklyn Park Bears',
		'Edina Eagles', // Carries over from previous seasons
		'Hopkins Hawks', // Carries over from previous seasons
		'Rosemount Rhinos',
		'Savage Salamanders',
		'Victoria Vipers',
		'Wayzata Walruses',
	]

	// Teams that carry over between seasons (for continuity)
	// These teams will have the same teamId across seasons
	const continuityTeams = new Map([
		['Bloomington Bears', generateDocId()], // 1999 -> 2000
		['Edina Eagles', generateDocId()], // 1999 -> 2000 -> 2025
		['Hopkins Hawks', generateDocId()], // 1999 -> 2000 -> 2025
		['Plymouth Panthers', generateDocId()], // 2000 -> 2025
	])

	const teams = []
	let teamIndex = 0

	// Track player assignments across all seasons to enable multi-season participation
	const allPlayerAssignments = new Map()

	for (const season of seasons) {
		console.log(`   Creating teams for ${season.name}...`)

		const seasonTeams = []
		const placements = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

		for (let i = 0; i < 12; i++) {
			const teamName = teamNames[teamIndex]

			// Use consistent teamId for continuity teams, otherwise generate new one
			let consistentTeamId = continuityTeams.get(teamName) || generateDocId()
			const isCarryoverTeam = continuityTeams.has(teamName)

			// Random registration date in October of the year before season start
			const seasonYear = parseInt(season.name.split(' ')[0])
			const registrationYear = seasonYear
			const randomDay = Math.floor(Math.random() * 31) + 1
			const registrationDate = createDate(
				`${registrationYear}-10-${randomDay.toString().padStart(2, '0')}`
			)

			// Assign 15 players to each team
			const teamSize = 15

			// Create a pool of players that includes repeats if necessary
			const playerPool = []
			while (playerPool.length < teamSize) {
				playerPool.push(...players)
			}
			shuffleArray(playerPool)
			const teamPlayers = playerPool.slice(0, teamSize)

			const roster = teamPlayers.map((player, index) => ({
				captain: index === 0, // First player is captain
				player: createRef(Collections.PLAYERS, player.id),
			}))

			// Generate and upload team logo
			const logoData = await generateAndUploadTeamLogo(
				teamName,
				consistentTeamId
			)

			const teamData = {
				logo: logoData.logoUrl,
				name: teamName,
				placement: placements[i],
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
				`     Created team: ${teamName} (Placement: ${placements[i]}, ${teamSize} players)${isCarryoverTeam ? ' [CARRYOVER]' : ''}`
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

function getRandomWeekend(year, month) {
	const daysInMonth = new Date(year, month, 0).getDate()
	const saturdays = []

	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(year, month - 1, day)
		if (date.getDay() === 6) {
			// Saturday
			saturdays.push(day)
		}
	}

	return saturdays[Math.floor(Math.random() * saturdays.length)]
}

async function createGames(seasons, teams) {
	console.log('🏒 Creating games...')

	const games = []

	// Game times for all seasons
	const gameTimes = [
		'18:00', // 6:00 PM
		'18:45', // 6:45 PM
		'19:30', // 7:30 PM
		'20:15', // 8:15 PM
	]

	// Helper function to get first 7 Saturdays in November and December for a given year
	const getSaturdays = (year) => {
		const saturdays = []

		// November
		for (let day = 1; day <= 30; day++) {
			const date = new Date(year, 10, day) // Month 10 = November
			if (date.getDay() === 6) {
				// Saturday = 6
				saturdays.push(`${year}-11-${day.toString().padStart(2, '0')}`)
			}
		}

		// December
		for (let day = 1; day <= 31; day++) {
			const date = new Date(year, 11, day) // Month 11 = December
			if (date.getDay() === 6) {
				// Saturday = 6
				saturdays.push(`${year}-12-${day.toString().padStart(2, '0')}`)
			}
		}

		// Return only the first 7 Saturdays for the season
		return saturdays.slice(0, 7)
	}

	// Helper function to generate random score (0-25)
	const generateScore = () => Math.floor(Math.random() * 26)

	// Helper function to create balanced matchups for a night
	const createNightMatchups = (seasonTeams) => {
		const shuffledTeams = shuffleArray([...seasonTeams])
		const matchups = []

		// Create 6 games (12 teams / 2 teams per game = 6 games)
		for (let i = 0; i < shuffledTeams.length; i += 2) {
			if (i + 1 < shuffledTeams.length) {
				matchups.push({
					home: shuffledTeams[i],
					away: shuffledTeams[i + 1],
				})
			}
		}

		return matchups
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

				// Determine winner
				if (game.homeScore > game.awayScore) {
					homeStats.wins++
					awayStats.losses++
					// Head-to-head tracking
					homeStats.headToHead.set(
						game.away.id,
						(homeStats.headToHead.get(game.away.id) || 0) + 1
					)
				} else if (game.awayScore > game.homeScore) {
					awayStats.wins++
					homeStats.losses++
					// Head-to-head tracking
					awayStats.headToHead.set(
						game.home.id,
						(awayStats.headToHead.get(game.home.id) || 0) + 1
					)
				}
				// Ties don't affect win/loss record but do affect point differential
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
				} else if (game.awayScore > game.homeScore) {
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
		const seasonYear = parseInt(season.name.split(' ')[0])
		const seasonTeams = teams.filter((team) => team.season.id === season.id)

		if (seasonTeams.length !== 12) {
			console.log(
				`   Expected 12 teams in ${season.name}, found ${seasonTeams.length}, skipping game creation`
			)
			continue
		}

		const gameDates = getSaturdays(seasonYear)
		console.log(
			`   Creating games for ${season.name} - ${gameDates.length} Saturday dates (7-week season)...`
		)

		// Determine if games are historical (completed) or future
		const isHistorical = seasonYear < 2025

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

						const gameData = {
							away: createRef(Collections.TEAMS, awayTeam.id),
							awayScore: isHistorical ? generateScore() : null,
							date: gameDateTime,
							field: field,
							home: createRef(Collections.TEAMS, homeTeam.id),
							homeScore: isHistorical ? generateScore() : null,
							season: createRef(Collections.SEASONS, season.id),
							type: GameType.REGULAR,
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

							const gameData = {
								away: createRef(Collections.TEAMS, awayTeam.id),
								awayScore: generateScore(),
								date: gameDateTime,
								field: field,
								home: createRef(Collections.TEAMS, homeTeam.id),
								homeScore: generateScore(),
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

						const gameData = {
							away: createRef(Collections.TEAMS, awayTeam.id),
							awayScore: generateScore(),
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, homeTeam.id),
							homeScore: generateScore(),
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

						const gameData = {
							away: createRef(Collections.TEAMS, awayTeam.id),
							awayScore: generateScore(),
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, homeTeam.id),
							homeScore: generateScore(),
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

						const gameData = {
							away: createRef(Collections.TEAMS, round2Loser.id),
							awayScore: generateScore(),
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, round1Loser.id),
							homeScore: generateScore(),
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

						const gameData = {
							away: createRef(Collections.TEAMS, round2Winner.id),
							awayScore: generateScore(),
							date: gameDateTime,
							field: i + 1,
							home: createRef(Collections.TEAMS, round1Winner.id),
							homeScore: generateScore(),
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

// Run the seeding script
seedTestData().catch(console.error)
