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
export { onOfferUpdated } from './triggers/documents/onOfferUpdated.js'
export { updateTeamRegistrationOnPlayerChange } from './triggers/documents/updateTeamRegistrationOnPlayerChange.js'
export { updateTeamRegistrationOnRosterChange } from './triggers/documents/updateTeamRegistrationOnRosterChange.js'
export { updateTeamRegistrationOnContributionChange } from './triggers/documents/updateTeamRegistrationOnContributionChange.js'
export { emailContributionReceipt } from './triggers/documents/emailContributionReceipt.js'
export { onTeamRegistrationChange } from './triggers/documents/onTeamRegistrationChange.js'
export { sendQueuedEmail } from './triggers/documents/sendQueuedEmail.js'
export { updatePlayoffsOnGameChange } from './triggers/documents/updatePlayoffsOnGameChange.js'

// Payment triggers
export { onPaymentCreated } from './triggers/payments/onPaymentCreated.js'

// Scheduled functions
export { sweepTeamPaymentsHourly } from './triggers/scheduled/sweepTeamPaymentsHourly.js'
export { reconcileTeamPaymentsDaily } from './triggers/scheduled/reconcileTeamPaymentsDaily.js'
export { rebuildRankingsNightly } from './triggers/scheduled/rebuildRankingsNightly.js'
export { awardBadgesNightly } from './triggers/scheduled/awardBadgesNightly.js'

//////////////////////////////////////////////////////////////////////////////
// API ENDPOINTS
//////////////////////////////////////////////////////////////////////////////

// Webhooks
export { stripeWebhook } from './api/webhooks/stripeWebhook.js'
export { emailUnsubscribe } from './api/emailUnsubscribe.js'
export { resendWebhook } from './api/webhooks/resendWebhook.js'

//////////////////////////////////////////////////////////////////////////////
// CALLABLE FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

// Player management functions (user-accessible)
export { createPlayer } from './functions/user/players/createPlayer.js'
export { updatePlayer } from './functions/user/players/updatePlayer.js'
export { deletePlayer } from './functions/user/players/deletePlayer.js'

// Player management functions (admin-only)
export { updatePlayerAdmin } from './functions/admin/players/updatePlayerAdmin.js'
export { getPlayerAuthInfo } from './functions/admin/players/getPlayerAuthInfo.js'

// Team management functions (user-accessible)
export { createTeam } from './functions/user/teams/createTeam.js'
export { rolloverTeam } from './functions/user/teams/rolloverTeam.js'
export { updateTeam } from './functions/user/teams/updateTeam.js'
export { deleteTeam } from './functions/user/teams/deleteTeam.js'
export { updateTeamRoster } from './functions/user/teams/updateTeamRoster.js'

// Team management functions (admin-only)
export { deleteUnregisteredTeam } from './functions/admin/teams/deleteUnregisteredTeam.js'
export { updateTeamAdmin } from './functions/admin/teams/updateTeamAdmin.js'
export { mergeTeams } from './functions/admin/teams/mergeTeams.js'

// Offer management functions (user-accessible)
export { createOffer } from './functions/user/offers/createOffer.js'
export { updateOffer } from './functions/user/offers/updateOffer.js'

// News management functions (admin-only)
export { createNews } from './functions/admin/news/createNews.js'
export { updateNews } from './functions/admin/news/updateNews.js'
export { deleteNews } from './functions/admin/news/deleteNews.js'

// Season management functions (admin-only)
export { createSeason } from './functions/admin/seasons/createSeason.js'
export { updateSeason } from './functions/admin/seasons/updateSeason.js'
export { deleteSeason } from './functions/admin/seasons/deleteSeason.js'

// Swiss season management functions (admin-only)
export { setSwissSeeding } from './functions/admin/swiss/setSwissSeeding.js'
export { getSwissRankings } from './functions/admin/swiss/getSwissRankings.js'

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
export { signWaiver } from './functions/user/waivers/signWaiver.js'

// Payment functions (user-accessible)
export { createStripeCheckout } from './functions/user/payments/createStripeCheckout.js'
export { createTeamContributionCheckout } from './functions/user/payments/createTeamContributionCheckout.js'
export { cancelTeamContributionCheckout } from './functions/user/payments/cancelTeamContributionCheckout.js'

// Payment management functions (admin-only)
export { refundTeamContribution } from './functions/admin/payments/refundTeamContribution.js'

// Game management functions (admin-only)
export { createGame } from './functions/admin/games/createGame.js'
export { updateGame } from './functions/admin/games/updateGame.js'
export { deleteGame } from './functions/admin/games/deleteGame.js'
// The regular season generated once; the playoffs follow from its scores
export { generateSchedule } from './functions/admin/games/generateSchedule.js'
export { updatePlayoffs } from './functions/admin/games/updatePlayoffs.js'

// Badges (admin-only): every badge is awarded by its rule, never by hand
export { rebuildBadges } from './functions/admin/badges/rebuildBadges.js'

// Site settings functions (admin-only)
export { updateSiteSettings } from './functions/admin/siteSettings/updateSiteSettings.js'

// Posts functions (user-accessible)
export { createPost } from './functions/user/posts/createPost.js'
export { updatePost } from './functions/user/posts/updatePost.js'
export { createReply } from './functions/user/posts/createReply.js'
export { updateReply } from './functions/user/posts/updateReply.js'

// Posts management functions (admin-only)
export { deletePost } from './functions/admin/posts/deletePost.js'
export { deleteReply } from './functions/admin/posts/deleteReply.js'
