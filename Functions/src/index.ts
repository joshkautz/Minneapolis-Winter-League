/**
 * Firebase Functions Entry Point
 *
 * This file serves as the main entry point for all Firebase Functions.
 * Functions are organized by type and domain:
 *
 * TRIGGERS:
 * - Authentication triggers (user lifecycle events)
 * - Document triggers (Firestore document changes)
 * - Payment triggers (payment processing events)
 *
 * API ENDPOINTS:
 * - Webhooks (external service callbacks)
 *
 * CALLABLE FUNCTIONS:
 * - Player management (CRUD operations)
 * - Team management (CRUD operations)
 * - Offer management (invitation/request system)
 * - Storage management (file upload/download)
 *
 * SERVICES:
 * - Waiver management (signature requests)
 * - Team registration (status management)
 *
 * This organization provides:
 * - Clear separation of concerns
 * - Easy to find and maintain functions
 * - Consistent naming conventions
 * - Type safety and error handling
 */

import { initializeApp } from './initializeApp.js'

// Initialize Firebase Admin
initializeApp()

//////////////////////////////////////////////////////////////////////////////
// TRIGGER FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Authentication triggers
export { userDeleted } from './triggers/auth/userDeleted.js'

// Document triggers
export { onOfferUpdated } from './triggers/documents/offerUpdated.js'
export { updateTeamRegistrationOnPlayerChange } from './triggers/documents/playerUpdated.js'
export {
	updateTeamRegistrationOnRosterChange,
	updateTeamRegistrationDate,
} from './triggers/documents/teamUpdated.js'

// Payment triggers
// export { onCheckoutSessionCreated } from './triggers/payments/checkoutSessionCreated.js'
export { onPaymentCreated } from './triggers/payments/paymentCreated.js'

//////////////////////////////////////////////////////////////////////////////
// API ENDPOINTS
//////////////////////////////////////////////////////////////////////////////

// Webhooks
export { dropboxSignWebhook } from './api/webhooks/dropboxSign.js'

//////////////////////////////////////////////////////////////////////////////
// CALLABLE FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Player management functions
export { createPlayer } from './functions/players/create.js'
export { updatePlayer } from './functions/players/update.js'
export { deletePlayer } from './functions/players/delete.js'
export { addNewSeasonToAllPlayers } from './functions/players/addNewSeason.js'

// Team management functions
export { createTeam } from './functions/teams/create.js'
export { rolloverTeam } from './functions/teams/rollover.js'
export { updateTeam } from './functions/teams/update.js'
export { deleteTeam } from './functions/teams/delete.js'
export { manageTeamPlayer } from './functions/teams/managePlayer.js'

// Offer management functions
export { createOffer } from './functions/offers/create.js'
export { updateOfferStatus } from './functions/offers/updateStatus.js'
export { cleanupOffers } from './functions/offers/cleanup.js'

// Storage functions
export { getUploadUrl } from './functions/storage/getUploadUrl.js'
export { getDownloadUrl } from './functions/storage/getDownloadUrl.js'
export { getFileMetadata } from './functions/storage/getFileMetadata.js'

// Player Rankings functions
export { rebuildPlayerRankings } from './functions/playerRankings/rebuildPlayerRankings.js'
export { updatePlayerRankings } from './functions/playerRankings/updatePlayerRankings.js'

// Dropbox Sign functions
export { dropboxSignSendReminderEmail } from './functions/dropboxSign/dropboxSignSendReminderEmail.js'
