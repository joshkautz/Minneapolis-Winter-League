/**
 * Firebase Functions Entry Point
 *
 * This file serves as the main entry point for all Firebase Functions.
 * Functions are organized by access level and domain:
 *
 * TRIGGERS:
 * - Authentication triggers (user lifecycle events)
 * - Document triggers (Firestore document changes)
 * - Payment triggers (payment processing events)
 *
 * API ENDPOINTS:
 * - Webhooks (external service callbacks)
 *
 * CALLABLE FUNCTIONS (ADMIN-ONLY):
 * - Player management (email updates, admin status, verification)
 * - Team management (unregistered team deletion)
 * - Game management (CRUD operations)
 * - News management (CRUD operations)
 * - Season management (CRUD operations with auto player integration)
 * - Player rankings (rebuild and update)
 *
 * CALLABLE FUNCTIONS (USER-ACCESSIBLE):
 * - Player management (CRUD operations)
 * - Team management (CRUD operations)
 * - Offer management (invitation/request system)
 * - Storage management (file upload/download)
 * - Dropbox Sign (waiver reminders)
 *
 * This organization provides:
 * - Clear separation between admin and user functions
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
export { updateTeamRegistrationOnRosterChange } from './triggers/documents/teamUpdated.js'
export { onTeamRegistrationChange } from './triggers/documents/teamRegistrationLock.js'

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

// Player management functions (user-accessible)
export { createPlayer } from './functions/user/players/create.js'
export { updatePlayer } from './functions/user/players/update.js'
export { deletePlayer } from './functions/user/players/delete.js'
export { addNewSeasonToAllPlayers } from './functions/user/players/addNewSeason.js'

// Player management functions (admin-only)
export { updatePlayerEmail } from './functions/admin/players/updateEmail.js'
export { updatePlayerAdmin } from './functions/admin/players/updatePlayerAdmin.js'
export { verifyUserEmail } from './functions/admin/players/verifyUserEmail.js'

// Team management functions (user-accessible)
export { createTeam } from './functions/user/teams/create.js'
export { rolloverTeam } from './functions/user/teams/rollover.js'
export { updateTeam } from './functions/user/teams/update.js'
export { deleteTeam } from './functions/user/teams/delete.js'
export { manageTeamPlayer } from './functions/user/teams/managePlayer.js'

// Team management functions (admin-only)
export { deleteUnregisteredTeam } from './functions/admin/teams/deleteUnregisteredTeam.js'

// Offer management functions (user-accessible)
export { createOffer } from './functions/user/offers/create.js'
export { updateOfferStatus } from './functions/user/offers/updateStatus.js'

// News management functions (admin-only)
export { createNews } from './functions/admin/news/create.js'
export { updateNews } from './functions/admin/news/update.js'
export { deleteNews } from './functions/admin/news/delete.js'

// Season management functions (admin-only)
export { createSeason } from './functions/admin/seasons/create.js'
export { updateSeason } from './functions/admin/seasons/update.js'
export { deleteSeason } from './functions/admin/seasons/delete.js'

// Storage functions (user-accessible)
export { getUploadUrl } from './functions/user/storage/getUploadUrl.js'
export { getDownloadUrl } from './functions/user/storage/getDownloadUrl.js'
export { getFileMetadata } from './functions/user/storage/getFileMetadata.js'

// Player Rankings functions (admin-only)
export { rebuildPlayerRankings } from './functions/admin/rankings/rebuildPlayerRankings.js'
export { updatePlayerRankings } from './functions/admin/rankings/updatePlayerRankings.js'

// Dropbox Sign functions (user-accessible)
export { dropboxSignSendReminderEmail } from './functions/user/dropboxSign/dropboxSignSendReminderEmail.js'

// Game management functions (admin-only)
export { createGame } from './functions/admin/games/createGame.js'
export { updateGame } from './functions/admin/games/updateGame.js'
export { deleteGame } from './functions/admin/games/deleteGame.js'
