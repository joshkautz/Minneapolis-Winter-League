/**
 * Karma Service
 *
 * Centralized service for all karma-related operations.
 * Handles awarding and reversing karma when players join or leave teams.
 *
 * Karma is awarded when a qualifying player joins a team:
 * - Player must have lookingForTeam=true
 * - Player must be fully registered (paid=true AND signed=true)
 *
 * Karma is reversed when:
 * - A player who earned karma leaves the team
 * - A player who earned karma is deleted from the system
 */

import { Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	KarmaTransaction,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
	TeamDocument,
} from '../types.js'

export const KARMA_AMOUNT = 100

/**
 * Result of a karma operation
 */
export interface KarmaOperationResult {
	success: boolean
	karmaChange: number
	message: string
}

/**
 * Checks if a player is fully registered for a season
 */
export function isPlayerFullyRegistered(
	playerSeasonData: PlayerSeason
): boolean {
	return Boolean(playerSeasonData?.paid && playerSeasonData?.signed)
}

/**
 * Checks if a player qualifies for karma bonus
 * Requirements: lookingForTeam=true and fully registered (paid + signed)
 */
export function qualifiesForKarmaBonus(
	playerSeasonData: PlayerSeason
): boolean {
	const isLookingForTeam = playerSeasonData?.lookingForTeam || false
	const isFullyRegistered = isPlayerFullyRegistered(playerSeasonData)
	return isLookingForTeam && isFullyRegistered
}

/**
 * Creates a karma transaction record in the team's subcollection
 */
export function createKarmaTransaction(
	transaction: FirebaseFirestore.Transaction,
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	amount: number,
	reason: 'player_joined' | 'player_left'
): void {
	const karmaTransactionRef = teamRef
		.collection('karma_transactions')
		.doc() as DocumentReference<KarmaTransaction>

	const karmaTransactionData: KarmaTransaction = {
		player: playerRef,
		team: teamRef,
		amount,
		reason,
		timestamp: Timestamp.now(),
		season: seasonRef,
	}

	transaction.set(karmaTransactionRef, karmaTransactionData)
}

/**
 * Checks if a team was awarded karma when a specific player joined
 * Returns the transaction if found, null otherwise
 */
export async function findKarmaTransactionForPlayerJoin(
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>
): Promise<KarmaTransaction | null> {
	const snapshot = await teamRef
		.collection('karma_transactions')
		.where('player', '==', playerRef)
		.where('season', '==', seasonRef)
		.where('reason', '==', 'player_joined')
		.where('amount', '>', 0)
		.limit(1)
		.get()

	if (snapshot.empty) {
		return null
	}

	return snapshot.docs[0].data() as KarmaTransaction
}

/**
 * Awards karma to a team when a qualifying player joins
 *
 * @param transaction - Firestore transaction
 * @param teamRef - Reference to the team document
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @param playerSeasonData - The player's season data to check qualification
 * @param currentTeamKarma - Current karma value on the team
 * @returns KarmaOperationResult with details of the operation
 */
export function awardKarmaForPlayerJoin(
	transaction: FirebaseFirestore.Transaction,
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	playerSeasonData: PlayerSeason | undefined,
	currentTeamKarma: number
): KarmaOperationResult {
	// Check if player qualifies for karma bonus
	if (!playerSeasonData || !qualifiesForKarmaBonus(playerSeasonData)) {
		return {
			success: true,
			karmaChange: 0,
			message: 'Player does not qualify for karma bonus',
		}
	}

	// Award karma
	const newKarma = currentTeamKarma + KARMA_AMOUNT

	// Create karma transaction record
	createKarmaTransaction(
		transaction,
		teamRef,
		playerRef,
		seasonRef,
		KARMA_AMOUNT,
		'player_joined'
	)

	logger.info('Awarded karma for player join', {
		teamId: teamRef.id,
		playerId: playerRef.id,
		seasonId: seasonRef.id,
		karmaAwarded: KARMA_AMOUNT,
		newTeamKarma: newKarma,
	})

	return {
		success: true,
		karmaChange: KARMA_AMOUNT,
		message: `Awarded ${KARMA_AMOUNT} karma for qualifying player`,
	}
}

/**
 * Reverses karma when a player leaves a team (only if karma was previously awarded)
 *
 * This function checks if karma was awarded when the player joined and reverses it.
 * Must be called BEFORE the player is removed from the roster.
 *
 * @param transaction - Firestore transaction
 * @param teamRef - Reference to the team document
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @param currentTeamKarma - Current karma value on the team
 * @param karmaTransactionFound - Result from findKarmaTransactionForPlayerJoin (pre-fetched)
 * @returns KarmaOperationResult with details of the operation
 */
export function reverseKarmaForPlayerLeave(
	transaction: FirebaseFirestore.Transaction,
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	currentTeamKarma: number,
	karmaTransactionFound: KarmaTransaction | null
): KarmaOperationResult {
	// Only reverse if karma was awarded when player joined
	if (!karmaTransactionFound) {
		return {
			success: true,
			karmaChange: 0,
			message: 'No karma to reverse (player did not earn karma when joining)',
		}
	}

	// Reverse karma
	const karmaReduction = -KARMA_AMOUNT
	const newKarma = Math.max(0, currentTeamKarma + karmaReduction)

	// Create karma transaction record for the reversal
	createKarmaTransaction(
		transaction,
		teamRef,
		playerRef,
		seasonRef,
		karmaReduction,
		'player_left'
	)

	logger.info('Reversed karma for player leave', {
		teamId: teamRef.id,
		playerId: playerRef.id,
		seasonId: seasonRef.id,
		karmaReversed: KARMA_AMOUNT,
		newTeamKarma: newKarma,
	})

	return {
		success: true,
		karmaChange: karmaReduction,
		message: `Reversed ${KARMA_AMOUNT} karma for departing player`,
	}
}

/**
 * Finds all karma transactions for a player across all teams for a specific season
 *
 * Used when a player is deleted to reverse karma on all teams they earned karma for.
 *
 * @param firestore - Firestore instance
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @returns Array of karma transactions with team references
 */
export async function findAllKarmaTransactionsForPlayer(
	firestore: FirebaseFirestore.Firestore,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>
): Promise<
	Array<{
		teamRef: DocumentReference<TeamDocument>
		transaction: KarmaTransaction
	}>
> {
	// Query all teams to find karma transactions for this player
	// This is necessary because karma_transactions is a subcollection of each team
	const teamsSnapshot = await firestore.collection(Collections.TEAMS).get()

	const results: Array<{
		teamRef: DocumentReference<TeamDocument>
		transaction: KarmaTransaction
	}> = []

	for (const teamDoc of teamsSnapshot.docs) {
		const teamRef = teamDoc.ref as DocumentReference<TeamDocument>
		const karmaTransaction = await findKarmaTransactionForPlayerJoin(
			teamRef,
			playerRef,
			seasonRef
		)

		if (karmaTransaction) {
			results.push({ teamRef, transaction: karmaTransaction })
		}
	}

	return results
}

/**
 * Reverses karma for a player being removed from a team (non-transactional version)
 *
 * Used when player deletion needs to reverse karma outside of a Firestore transaction.
 * This performs the karma reversal as a separate update.
 *
 * @param firestore - Firestore instance
 * @param teamRef - Reference to the team document
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @returns KarmaOperationResult with details of the operation
 */
export async function reverseKarmaForPlayerDeletion(
	firestore: FirebaseFirestore.Firestore,
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>
): Promise<KarmaOperationResult> {
	try {
		// Check if karma was awarded
		const karmaTransaction = await findKarmaTransactionForPlayerJoin(
			teamRef,
			playerRef,
			seasonRef
		)

		if (!karmaTransaction) {
			return {
				success: true,
				karmaChange: 0,
				message: 'No karma to reverse',
			}
		}

		// Get current team karma
		const teamDoc = await teamRef.get()
		const teamData = teamDoc.data()
		if (!teamData) {
			return {
				success: false,
				karmaChange: 0,
				message: 'Team not found',
			}
		}

		const currentKarma = teamData.karma || 0
		const newKarma = Math.max(0, currentKarma - KARMA_AMOUNT)

		// Update team karma and create reversal transaction
		await firestore.runTransaction(async (transaction) => {
			transaction.update(teamRef, { karma: newKarma })

			createKarmaTransaction(
				transaction,
				teamRef,
				playerRef,
				seasonRef,
				-KARMA_AMOUNT,
				'player_left'
			)
		})

		logger.info('Reversed karma for player deletion', {
			teamId: teamRef.id,
			playerId: playerRef.id,
			seasonId: seasonRef.id,
			karmaReversed: KARMA_AMOUNT,
			newTeamKarma: newKarma,
		})

		return {
			success: true,
			karmaChange: -KARMA_AMOUNT,
			message: `Reversed ${KARMA_AMOUNT} karma`,
		}
	} catch (error) {
		logger.error('Failed to reverse karma for player deletion', {
			teamId: teamRef.id,
			playerId: playerRef.id,
			error: error instanceof Error ? error.message : 'Unknown error',
		})

		return {
			success: false,
			karmaChange: 0,
			message: error instanceof Error ? error.message : 'Unknown error',
		}
	}
}
