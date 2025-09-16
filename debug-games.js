#!/usr/bin/env node

/**
 * Debug script to check game counts
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase Admin
initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = getFirestore()

async function analyzeGames() {
	try {
		console.log('🔍 Analyzing games in database...')

		// Get 2023 Fall season
		const seasonSnapshot = await db
			.collection('seasons')
			.where('name', '==', '2023 Fall')
			.limit(1)
			.get()

		if (seasonSnapshot.empty) {
			console.log('❌ 2023 Fall season not found')
			return
		}

		const seasonDoc = seasonSnapshot.docs[0]
		console.log(`✅ Found 2023 Fall season: ${seasonDoc.id}`)

		// Get all games for this season
		const gamesSnapshot = await db
			.collection('games')
			.where('season', '==', seasonDoc.ref)
			.orderBy('date', 'asc')
			.get()

		console.log(`📊 Total games for 2023 Fall: ${gamesSnapshot.size}`)

		// Group games by date to see weekly distribution
		const gamesByDate = {}
		const gameDetails = []

		gamesSnapshot.docs.forEach((doc) => {
			const game = doc.data()
			const dateStr = game.date.toDate().toISOString().split('T')[0]

			if (!gamesByDate[dateStr]) {
				gamesByDate[dateStr] = []
			}

			gamesByDate[dateStr].push({
				id: doc.id,
				homeTeam: game.home?.id || 'unknown',
				awayTeam: game.away?.id || 'unknown',
				homeScore: game.homeScore,
				awayScore: game.awayScore,
				time: game.date.toDate().toTimeString().split(' ')[0],
			})

			gameDetails.push({
				id: doc.id,
				date: dateStr,
				time: game.date.toDate().toTimeString().split(' ')[0],
				homeTeam: game.home?.id || 'unknown',
				awayTeam: game.away?.id || 'unknown',
				homeScore: game.homeScore,
				awayScore: game.awayScore,
			})
		})

		console.log('\n📅 Games by date:')
		Object.keys(gamesByDate)
			.sort()
			.forEach((date) => {
				console.log(`  ${date}: ${gamesByDate[date].length} games`)
				gamesByDate[date].forEach((game) => {
					console.log(
						`    ${game.time} - ${game.homeTeam} vs ${game.awayTeam} (${game.homeScore}-${game.awayScore})`
					)
				})
			})

		// Check for potential duplicates (same teams, same time)
		console.log('\n🔍 Checking for potential duplicates...')
		const gameSignatures = {}
		let duplicateCount = 0

		gameDetails.forEach((game) => {
			const signature = `${game.date}_${game.time}_${game.homeTeam}_${game.awayTeam}`
			if (gameSignatures[signature]) {
				console.log(`❗ Potential duplicate: ${signature}`)
				console.log(`   First: ${gameSignatures[signature].id}`)
				console.log(`   Second: ${game.id}`)
				duplicateCount++
			} else {
				gameSignatures[signature] = game
			}
		})

		if (duplicateCount === 0) {
			console.log('✅ No obvious duplicates found')
		} else {
			console.log(`❌ Found ${duplicateCount} potential duplicates`)
		}

		// Expected vs actual
		console.log('\n📈 Expected vs Actual:')
		console.log('  Expected: 12 games per week × 4 weeks = 48 total games')
		console.log(`  Actual: ${gamesSnapshot.size} total games`)
		console.log(`  Ratio: ${(gamesSnapshot.size / 48).toFixed(2)}x expected`)
	} catch (error) {
		console.error('❌ Error:', error.message)
	}
}

analyzeGames()
