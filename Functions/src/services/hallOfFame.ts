/**
 * Hall of Fame Elo Rating System for Minneapolis Winter League Ultimate Frisbee
 *
 * This service implements a sophisticated player ranking algorithm optimized for
 * 40-minute Ultimate Frisbee games with ~20 total points scored. Features:
 * - Uses point differentials instead of wins/losses (perfect for meaningful margins)
 * - Applies diminishing returns to large point differentials
 * - Weights recent seasons exponentially higher
 * - Increases playoff points by 1.8x (accounting for time-pressure variance)
 * - Calculates team strength from average player ratings
 * - Uses Elo-style system where beating stronger teams awards more points
 * - Applies rating decay for inactive players
 * - Optimized K-factor (36) balanced for 20-point game information content
 *
 * NOTE: This file has been refactored into smaller modules.
 * All functionality is now re-exported from ./hallOfFame/index.ts
 */

export * from './hallOfFame/index.js'
