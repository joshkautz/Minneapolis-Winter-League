/**
 * Player Rankings Elo Rating System for Minneapolis Winter League Ultimate Frisbee
 *
 * This system calculates Elo-style ratings for players based on their game performance,
 * applying team strength calculations, point differentials, and inactivity decay.
 *
 * Key Features:
 * - ELO rating system with team composition adjustments
 * - Point differential weighting (games to 20 points)
 * - Inactivity decay for seasonal fairness
 * - Incremental calculation support
 * - Weekly snapshot tracking
 * - Round-based chronological processing
 *
 * Technical Architecture:
 * - Uses Firebase Firestore for persistence
 * - Modular calculation pipeline
 * - All functionality is now re-exported from ./playerRankings/index.ts
 */

export * from './playerRankings/index.js'

export * from './playerRankings/index.js'
