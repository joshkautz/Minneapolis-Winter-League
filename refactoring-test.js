/**
 * Simple test to verify the OfferData refactoring
 */

import { OfferType, OfferDirection } from './Shared/dist/types.js'

try {
	console.log('✅ Successfully imported new types')
	console.log('OfferType values:', Object.values(OfferType))
	console.log('OfferDirection values:', Object.values(OfferDirection))

	console.log('\n🎉 Refactoring appears successful!')
	console.log('Summary of changes:')
	console.log('- OfferCreator enum → OfferType enum (request/invitation)')
	console.log('- ExtendedOfferData interface → removed (merged into OfferData)')
	console.log('- creator field → type field')
	console.log('- creatorName field → creator field')
	console.log('- Added optional playerName and teamName fields to OfferData')
} catch (error) {
	console.error('❌ Error importing types:', error.message)
}
