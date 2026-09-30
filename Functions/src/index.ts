/**
 * The deploy manifest: every Cloud Function is exported from here, and a
 * function that is not exported is not deployed.
 *
 * Exports are grouped by kind (triggers, HTTP endpoints, admin callables,
 * player callables) under the banners below. docs/functions/README.md lists
 * what each one does.
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
export { updateTeamRegistrationOnContributionChange } from './triggers/documents/contributionWritten.js'
export { emailContributionReceipt } from './triggers/documents/contributionReceipt.js'
export { onTeamRegistrationChange } from './triggers/documents/teamRegistrationLock.js'
export { sendQueuedEmail } from './triggers/documents/mailQueued.js'

// Payment triggers
export { onPaymentCreated } from './triggers/payments/paymentCreated.js'

// Scheduled functions
export { sweepTeamPaymentsHourly } from './triggers/scheduled/sweepTeamPayments.js'
export { reconcileTeamPaymentsDaily } from './triggers/scheduled/reconcileTeamPayments.js'
export { rebuildRankingsNightly } from './triggers/scheduled/rebuildRankingsNightly.js'

//////////////////////////////////////////////////////////////////////////////
// API ENDPOINTS
//////////////////////////////////////////////////////////////////////////////

// Webhooks
export { stripeWebhook } from './api/webhooks/stripe.js'
export { emailUnsubscribe } from './api/emailUnsubscribe.js'
export { resendWebhook } from './api/webhooks/resend.js'

//////////////////////////////////////////////////////////////////////////////
// CALLABLE FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Player management functions (user-accessible)
export { createPlayer } from './functions/user/players/create.js'
export { updatePlayer } from './functions/user/players/update.js'
export { deletePlayer } from './functions/user/players/delete.js'

// Player management functions (admin-only)
export { updatePlayerAdmin } from './functions/admin/players/updatePlayerAdmin.js'
export { getPlayerAuthInfo } from './functions/admin/players/getPlayerAuthInfo.js'

// Team management functions (user-accessible)
export { createTeam } from './functions/user/teams/create.js'
export { rolloverTeam } from './functions/user/teams/rollover.js'
export { updateTeam } from './functions/user/teams/update.js'
export { deleteTeam } from './functions/user/teams/delete.js'
export { updateTeamRoster } from './functions/user/teams/updateRoster.js'

// Team management functions (admin-only)
export { deleteUnregisteredTeam } from './functions/admin/teams/deleteUnregisteredTeam.js'
export { updateTeamAdmin } from './functions/admin/teams/updateTeamAdmin.js'
export { mergeTeams } from './functions/admin/teams/mergeTeams.js'

// Offer management functions (user-accessible)
export { createOffer } from './functions/user/offers/create.js'
export { updateOffer } from './functions/user/offers/update.js'

// News management functions (admin-only)
export { createNews } from './functions/admin/news/create.js'
export { updateNews } from './functions/admin/news/update.js'
export { deleteNews } from './functions/admin/news/delete.js'

// Season management functions (admin-only)
export { createSeason } from './functions/admin/seasons/create.js'
export { updateSeason } from './functions/admin/seasons/update.js'
export { deleteSeason } from './functions/admin/seasons/delete.js'

// Swiss season management functions (admin-only)
export { setSwissSeeding } from './functions/admin/swiss/setSeeding.js'
export { getSwissRankings } from './functions/admin/swiss/getRankings.js'

// Player Rankings (admin-only). A full rebuild every time: TrueSkill carries
// uncertainty through every game, so there is no incremental update.
export { rebuildPlayerRankings } from './functions/admin/rankings/rebuildPlayerRankings.js'

// Email (admin-only)
export { sendSeasonAnnouncement } from './functions/admin/email/sendSeasonAnnouncement.js'
export { sendEmailPreview } from './functions/admin/email/sendEmailPreview.js'

// Email preferences: a link from the player's email, or signed in
export { getEmailPreferences } from './functions/user/email/getEmailPreferences.js'
export { updateEmailPreferences } from './functions/user/email/updateEmailPreferences.js'

// Waiver functions (user-accessible)
export { signWaiver } from './functions/user/waivers/sign.js'

// Payment functions (user-accessible)
export { createStripeCheckout } from './functions/user/payments/createStripeCheckout.js'
export { createTeamContributionCheckout } from './functions/user/payments/createTeamContributionCheckout.js'
export { cancelTeamContributionCheckout } from './functions/user/payments/cancelTeamContributionCheckout.js'

// Payment management functions (admin-only)
export { refundTeamContribution } from './functions/admin/payments/refundTeamContribution.js'

// Game management functions (admin-only)
export { createGame } from './functions/admin/games/create.js'
export { updateGame } from './functions/admin/games/update.js'
export { deleteGame } from './functions/admin/games/delete.js'

// Badge management functions (admin-only)
export { createBadge } from './functions/admin/badges/create.js'
export { updateBadge } from './functions/admin/badges/update.js'
export { deleteBadge } from './functions/admin/badges/delete.js'
export { awardBadge } from './functions/admin/badges/awardBadge.js'
export { revokeBadge } from './functions/admin/badges/revokeBadge.js'

// Site settings functions (admin-only)
export { updateSiteSettings } from './functions/admin/site-settings/updateSiteSettings.js'

// Posts functions (user-accessible)
export { createPost } from './functions/user/posts/createPost.js'
export { updatePost } from './functions/user/posts/updatePost.js'
export { createReply } from './functions/user/posts/createReply.js'
export { updateReply } from './functions/user/posts/updateReply.js'

// Posts management functions (admin-only)
export { deletePost } from './functions/admin/posts/deletePost.js'
export { deleteReply } from './functions/admin/posts/deleteReply.js'
