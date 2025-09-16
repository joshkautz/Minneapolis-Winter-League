#!/usr/bin/env node

/**
 * Example script showing how to use the new round-based Hall of Fame calculations
 */

import { initializeApp } from 'firebase-admin/app'
import { getFunctions } from 'firebase-admin/functions'

// Initialize Firebase Admin
initializeApp({
	projectId: 'minnesota-winter-league',
})

const functions = getFunctions()

async function demonstrateRoundBasedCalculations() {
	console.log('🏒 Round-Based Hall of Fame Calculation Demo\n')

	try {
		// Example 1: Get current round calculation status
		console.log('📊 Getting round calculation status...')
		// Note: In a real implementation, you'd call this via the Firebase Functions client
		// const statusResult = await functions.httpsCallable('getRoundCalculationStatus')()
		console.log('   Use: getRoundCalculationStatus()')
		console.log(
			'   Returns: total rounds, calculated rounds, last calculation time\n'
		)

		// Example 2: Run a full round-based calculation
		console.log('🔄 Running full round-based calculation...')
		// const fullResult = await functions.httpsCallable('calculateHallOfFameRankings')({
		//   calculationType: 'round-based',
		//   applyDecay: true,
		//   onlyNewRounds: false
		// })
		console.log('   Use: calculateHallOfFameRankings()')
		console.log('   Parameters: {')
		console.log('     calculationType: "round-based",')
		console.log('     applyDecay: true,')
		console.log('     onlyNewRounds: false  // Process all rounds')
		console.log('   }\n')

		// Example 3: Run an iterative calculation (only new rounds)
		console.log('⚡ Running iterative calculation (new rounds only)...')
		// const iterativeResult = await functions.httpsCallable('calculateHallOfFameIterative')({
		//   onlyNewRounds: true,
		//   applyDecay: true
		// })
		console.log('   Use: calculateHallOfFameIterative()')
		console.log('   Parameters: {')
		console.log(
			'     onlyNewRounds: true,  // Only process uncalculated rounds'
		)
		console.log('     applyDecay: true')
		console.log('   }\n')

		console.log('✅ Round-based calculation benefits:')
		console.log(
			'   • True chronological order (games at same time processed together)'
		)
		console.log('   • Prevents duplicate calculations')
		console.log('   • Enables incremental updates')
		console.log('   • Better progress tracking')
		console.log('   • Safer for large datasets')
	} catch (error) {
		console.error('❌ Error in demonstration:', error)
	}
}

// Typical usage scenarios
console.log('\n🎯 Common Usage Scenarios:\n')

console.log('1. INITIAL SETUP (Full Calculation):')
console.log('   calculateHallOfFameRankings({')
console.log('     calculationType: "round-based",')
console.log('     applyDecay: true,')
console.log('     onlyNewRounds: false')
console.log('   })\n')

console.log('2. REGULAR UPDATES (After adding new games):')
console.log('   calculateHallOfFameIterative({')
console.log('     onlyNewRounds: true,')
console.log('     applyDecay: false  // Usually no decay for incremental')
console.log('   })\n')

console.log('3. CHECKING STATUS:')
console.log('   getRoundCalculationStatus()  // Overall status')
console.log(
	'   getRoundCalculationStatus({ seasonId: "2023-fall" })  // Season-specific\n'
)

demonstrateRoundBasedCalculations()
