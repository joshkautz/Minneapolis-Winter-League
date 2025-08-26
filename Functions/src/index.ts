/**
 * Firebase Functions Entry Point
 *
 * This file serves as the main entry point for all Firebase Functions.
 * Functions are organized into separate modules by functionality:
 * - Authentication triggers
 * - Payment and waiver triggers
 * - Team registration triggers
 * - Player management functions
 * - Team management functions
 * - Offer management functions
 * - Storage functions
 */

import { initializeApp } from './initializeApp.js'

// Initialize Firebase Admin
initializeApp()

//////////////////////////////////////////////////////////////////////////////
// TRIGGER FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Authentication triggers
export { userDeleted } from './triggers/authTriggers.js'

// Payment and waiver triggers
export {
	onPaymentCreated,
	dropboxSignWebhook,
	resendWaiverEmail,
} from './triggers/paymentTriggers.js'

// Team registration triggers
export {
	updateTeamRegistrationOnPlayerChange,
	updateTeamRegistrationOnRosterChange,
	updateTeamRegistrationDate,
} from './triggers/teamTriggers.js'

//////////////////////////////////////////////////////////////////////////////
// CALLABLE FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Player management functions
export { createPlayer, updatePlayer, deletePlayer } from './playerFunctions.js'

// Team management functions
export {
	createTeam,
	deleteTeam,
	manageTeamPlayer,
	editTeam,
} from './teamFunctions.js'

// Offer management functions
export {
	createOffer,
	cleanupOffers,
	onOfferUpdated,
	updateOfferStatus,
} from './offerFunctions.js'

// Storage functions
export {
	getUploadUrl,
	getDownloadUrl,
	getFileMetadata,
} from './storageFunctions.js'
