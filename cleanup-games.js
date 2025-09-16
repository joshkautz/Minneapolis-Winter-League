#!/usr/bin/env node

/**
 * Clean up duplicate games and reseed properly
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase Admin
initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = getFirestore()

async function cleanupAndReseed() {
	try {
		console.log('🧹 Cleaning up duplicate games for 2023 Fall...')

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

		// Delete ALL games for 2023 Fall
		const gamesSnapshot = await db
			.collection('games')
			.where('season', '==', seasonDoc.ref)
			.get()

		if (!gamesSnapshot.empty) {
			console.log(`🗑️ Deleting ${gamesSnapshot.size} existing games...`)
			const batch = db.batch()
			gamesSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log('✅ All games deleted')
		}

		// Clear ranking calculations to force fresh calculation
		const rankingsSnapshot = await db.collection('rankings').get()
		if (!rankingsSnapshot.empty) {
			console.log(`🗑️ Clearing ${rankingsSnapshot.size} existing rankings...`)
			const batch = db.batch()
			rankingsSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log('✅ Rankings cleared')
		}

		console.log('\n✅ Cleanup complete!')
		console.log('\nNext steps:')
		console.log('1. Run: node scripts/seed.js --week 1 --season "2023 Fall"')
		console.log('2. Run: node scripts/seed.js --week 2 --season "2023 Fall"')
		console.log('3. Run: node scripts/seed.js --week 3 --season "2023 Fall"')
		console.log('4. Run: node scripts/seed.js --week 4 --season "2023 Fall"')
		console.log('5. Run: node scripts/calculate.js --full')
	} catch (error) {
		console.error('❌ Error:', error.message)
	}
}

cleanupAndReseed()
