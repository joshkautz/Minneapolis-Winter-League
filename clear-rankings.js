#!/usr/bin/env node

/**
 * Clear all ranking data and do a fresh calculation
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase Admin
initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = getFirestore()

async function clearRankingData() {
	try {
		console.log('🧹 Clearing all ranking data...')

		// Clear player rankings
		const rankingsSnapshot = await db.collection('rankings').get()
		if (!rankingsSnapshot.empty) {
			console.log(`🗑️ Deleting ${rankingsSnapshot.size} player rankings...`)
			const batch = db.batch()
			rankingsSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log('✅ Rankings cleared')
		}

		// Clear ranking history/snapshots
		const historySnapshot = await db.collection('ranking_history').get()
		if (!historySnapshot.empty) {
			console.log(
				`🗑️ Deleting ${historySnapshot.size} ranking history entries...`
			)
			const batch = db.batch()
			historySnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log('✅ Ranking history cleared')
		}

		// Clear ranking calculations
		const calculationsSnapshot = await db
			.collection('ranking_calculations')
			.get()
		if (!calculationsSnapshot.empty) {
			console.log(
				`🗑️ Deleting ${calculationsSnapshot.size} calculation records...`
			)
			const batch = db.batch()
			calculationsSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref)
			})
			await batch.commit()
			console.log('✅ Calculation records cleared')
		}

		console.log('\n✅ All ranking data cleared!')
		console.log('\nNext steps:')
		console.log('1. Run a FULL ranking calculation (not incremental)')
		console.log('2. Check that players now have 8 games instead of 20')
	} catch (error) {
		console.error('❌ Error:', error.message)
	}
}

clearRankingData()
