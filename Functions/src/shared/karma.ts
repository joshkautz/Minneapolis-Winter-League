/**
 * Karma utilities
 *
 * Re-exports from karmaService for backward compatibility.
 * New code should import directly from '../services/karmaService.js'
 */

export {
	KARMA_AMOUNT,
	isPlayerFullyRegistered,
	qualifiesForKarmaBonus,
	createKarmaTransaction,
	findKarmaTransactionForPlayerJoin,
	awardKarmaForPlayerJoin,
	reverseKarmaForPlayerLeave,
	findAllKarmaTransactionsForPlayer,
	reverseKarmaForPlayerDeletion,
	type KarmaOperationResult,
} from '../services/karmaService.js'
