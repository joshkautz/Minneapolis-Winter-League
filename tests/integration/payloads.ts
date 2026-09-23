/**
 * Minimally valid request payloads, one per callable.
 *
 * The authorization sweep needs these because several callables validate
 * their arguments *before* checking who is calling. Sending `{}` makes those
 * fail with `invalid-argument`, which looks like a rejection but proves
 * nothing about the auth gate — the gate could be missing entirely and the
 * test would still pass.
 *
 * Every payload here is shaped to get past argument validation, so whatever
 * the callable throws next is the authorization decision.
 *
 * Values reference fixture ids seeded by the test's beforeEach; they do not
 * need to resolve, because an unauthorized call must be rejected before
 * anything is looked up.
 */

const FUTURE = new Date('2030-01-01T00:00:00.000Z')
const LATER = new Date('2030-03-01T00:00:00.000Z')

export const VALID_PAYLOADS: Record<string, Record<string, unknown>> = {
	// --- admin: badges -----------------------------------------------------
	awardBadge: { badgeId: 'badge-1', teamId: 'team-1', seasonId: 'season-1' },
	createBadge: {
		name: 'Early Bird',
		description: 'First team to fully register for the season.',
	},
	deleteBadge: { badgeId: 'badge-1' },
	revokeBadge: { badgeId: 'badge-1', teamId: 'team-1' },
	updateBadge: { badgeId: 'badge-1', name: 'Early Birds' },

	// --- admin: games ------------------------------------------------------
	createGame: {
		homeTeamId: 'team-1',
		awayTeamId: 'team-2',
		homeScore: null,
		awayScore: null,
		field: 1,
		type: 'regular',
		timestamp: FUTURE.toISOString(),
	},
	deleteGame: { gameId: 'game-1' },
	updateGame: { gameId: 'game-1', homeScore: 15, awayScore: 10 },

	// --- admin: news -------------------------------------------------------
	createNews: {
		title: 'Season starts soon',
		content: 'The 2030 season begins in January.',
		seasonId: 'season-1',
	},
	deleteNews: { newsId: 'news-1' },
	updateNews: { newsId: 'news-1', title: 'Updated title' },

	// --- admin: players ----------------------------------------------------
	getPlayerAuthInfo: { playerId: 'player-1' },
	updatePlayerEmail: { playerId: 'player-1', newEmail: 'new@example.com' },
	updatePlayerAdmin: { playerId: 'player-1', firstname: 'Renamed' },

	// --- admin: posts ------------------------------------------------------
	deletePost: { postId: 'post-1' },
	deleteReply: { postId: 'post-1', replyId: 'reply-1' },

	// --- admin: rankings ---------------------------------------------------
	rebuildPlayerRankings: {},

	// --- admin: seasons ----------------------------------------------------
	createSeason: {
		name: '2030 Winter',
		dateStart: FUTURE,
		dateEnd: LATER,
		registrationStart: FUTURE,
		registrationEnd: LATER,
	},
	deleteSeason: { seasonId: 'season-1' },
	updateSeason: {
		seasonId: 'season-1',
		name: '2030 Winter',
		dateStart: FUTURE,
		dateEnd: LATER,
		registrationStart: FUTURE,
		registrationEnd: LATER,
	},

	// --- admin: site settings / swiss / teams / waivers ---------------------
	updateSiteSettings: { themeVariant: 'default' },
	setSwissSeeding: { seasonId: 'season-1', teamSeeding: ['team-1', 'team-2'] },
	getSwissRankings: { seasonId: 'season-1' },
	mergeTeams: { winningTeamId: 'team-1', losingTeamId: 'team-2' },
	deleteUnregisteredTeam: { teamId: 'team-1' },
	updateTeamAdmin: { teamId: 'team-1', seasonId: 'season-1', name: 'Renamed' },
	sendWaiverAdmin: { playerId: 'player-1', seasonId: 'season-1' },

	// --- user: offers ------------------------------------------------------
	createOffer: { playerId: 'player-1', teamId: 'team-1', type: 'invitation' },
	updateOffer: { offerId: 'offer-1', status: 'accepted' },

	// --- user: players -----------------------------------------------------
	createPlayer: {
		firstname: 'New',
		lastname: 'Player',
		email: 'new@example.com',
	},
	updatePlayer: { firstname: 'Renamed' },
	deletePlayer: {},

	// --- user: posts -------------------------------------------------------
	createPost: {
		content: 'Looking for a team this season.',
		seasonId: 'season-1',
	},
	updatePost: { postId: 'post-1', content: 'Edited post content.' },
	createReply: { postId: 'post-1', content: 'Replying to this post.' },
	updateReply: {
		postId: 'post-1',
		replyId: 'reply-1',
		content: 'Edited reply.',
	},

	// --- user: payments ----------------------------------------------------
	createStripeCheckout: {
		priceId: 'price_test',
		successUrl: 'https://mplswinterleague.com/profile?payment=success',
		cancelUrl: 'https://mplswinterleague.com/profile?payment=cancel',
	},
	releaseTeamContribution: {
		teamId: 'team-1',
		seasonId: 'season-1',
		paymentIntentId: 'pi_1',
		reason: 'Payer left the team before it registered.',
	},
	createTeamContributionCheckout: {
		amountCents: 25_000,
		successUrl: 'https://mplswinterleague.com/teams/team-1?payment=success',
		cancelUrl: 'https://mplswinterleague.com/teams/team-1?payment=cancel',
	},

	// --- user: teams -------------------------------------------------------
	createTeam: { name: 'Test Team', seasonId: 'season-1' },
	deleteTeam: { teamId: 'team-1', seasonId: 'season-1' },
	updateTeam: { teamId: 'team-1', seasonId: 'season-1', name: 'Renamed' },
	updateTeamRoster: {
		teamId: 'team-1',
		playerId: 'player-1',
		action: 'remove',
	},
	rolloverTeam: { originalTeamId: 'team-1', seasonId: 'season-1' },

	// --- user: storage / waivers -------------------------------------------
	getUploadUrl: {
		fileName: 'logo.png',
		contentType: 'image/png',
		filePath: 'team-logos/logo.png',
	},
	getDownloadUrl: { filePath: 'team-logos/logo.png' },
	getFileMetadata: { filePath: 'team-logos/logo.png' },
	sendWaiverReminder: {},
}
