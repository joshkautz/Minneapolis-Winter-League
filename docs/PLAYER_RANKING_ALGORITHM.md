# Player Ranking Algorithm - Technical Specification

> **Minneapolis Winter League Player Rankings Rating System**
>
> A comprehensive ELO-based player ranking algorithm that evaluates individual performance across seasons, considering point differentials, opponent strength, playoff performance, and round-based inactivity decay.

## Table of Contents

- [Mathematical Notation](#mathematical-notation)
- [Overview](#overview)
- [Algorithm Constants](#algorithm-constants)
- [Core Components](#core-components)
- [Rating Calculation Process](#rating-calculation-process)
- [Team Strength Analysis](#team-strength-analysis)
- [Point Differential Weighting](#point-differential-weighting)
- [Season and Time-Based Factors](#season-and-time-based-factors)
- [Round-Based Decay Mechanics](#round-based-decay-mechanics)
- [Round Snapshots and History](#round-snapshots-and-history)
- [Calculation Flow](#calculation-flow)
- [Technical Implementation](#technical-implementation)

## Mathematical Notation

| Symbol                                     | Description                           |
| ------------------------------------------ | ------------------------------------- |
| $R$                                        | Player rating                         |
| $R_0, R_{\text{start}}$                    | Starting rating (1200)                |
| $R_{\text{old}}, R_{\text{new}}$           | Rating before/after update            |
| $\Delta R$                                 | Rating change                         |
| $E, E_A$                                   | Expected score                        |
| $S_{\text{actual}}$                        | Actual score (0-1 scale)              |
| $K, K_{\text{base}}, K_{\text{effective}}$ | K-factor values                       |
| $d, d_{\max}$                              | Point differential values             |
| $\alpha$                                   | Season decay factor (0.82)            |
| $\beta$                                    | Round inactivity decay factor (0.996) |
| $f_{\text{season}}, f_{\text{playoff}}$    | Temporal multipliers                  |
| $n$                                        | Season order or count                 |
| $r$                                        | Rounds of inactivity                  |
| $C, C_{\min}$                              | Confidence scores                     |
| $\bar{R}_{\text{team}}$                    | Team average rating                   |

## Overview

The Minneapolis Winter League employs a sophisticated **ELO-based rating system** that goes beyond traditional win/loss metrics. The algorithm evaluates individual player performance by analyzing:

- **Point Differentials**: How much a player's team won or lost by
- **Opponent Strength**: The relative skill level of opposing teams
- **Team Context**: The strength of a player's own team
- **Temporal Factors**: Recent performance weighted more heavily
- **Game Importance**: Playoff games carry additional weight
- **Round-Based Decay**: Gradual rating decline during periods of inactivity

### Key Innovations

1. **Point Differential Focus**: Uses margin of victory/defeat rather than binary win/loss
2. **Diminishing Returns**: Large point differentials have reduced impact to prevent outlier games from dominating
3. **Dynamic Team Strength**: Calculates team strength based on current player ratings
4. **Temporal Weighting**: Recent seasons and games matter more than historical performance
5. **Playoff Amplification**: Postseason performance has 1.8x impact
6. **Round-Based Decay**: Continuous gradual decay (0.996 per round) instead of arbitrary thresholds

## Algorithm Constants

The following constants define the behavior of the rating system:

| Constant                       | Symbol               | Value | Description                              |
| ------------------------------ | -------------------- | ----- | ---------------------------------------- |
| `STARTING_RATING`              | $R_0$                | 1200  | Initial rating for new players           |
| `K_FACTOR`                     | $K$                  | 36    | Maximum rating change per game           |
| `PLAYOFF_MULTIPLIER`           | $f_p$                | 1.8   | Playoff games worth 1.8× points          |
| `SEASON_DECAY_FACTOR`          | $\alpha$             | 0.82  | Each past season weighted at 82%         |
| `INACTIVITY_DECAY_PER_ROUND`   | $\beta$              | 0.996 | 0.4% rating decay per inactive round     |
| `MAX_FULL_WEIGHT_DIFFERENTIAL` | $d_{\max}$           | 5     | Diminishing returns beyond ±5 points     |
| `MIN_TEAM_CONFIDENCE`          | $C_{\min}$           | 0.5   | Minimum rated player ratio for team calc |
| `DEFAULT_TEAM_STRENGTH`        | $R_{\text{default}}$ | 1200  | Fallback team strength                   |

```typescript
ALGORITHM_CONSTANTS = {
	// Core ELO Settings
	STARTING_RATING: 1200, // R₀
	K_FACTOR: 36, // K

	// Game Type Multipliers
	PLAYOFF_MULTIPLIER: 1.8, // fₚ

	// Temporal Decay Factors
	SEASON_DECAY_FACTOR: 0.82, // α
	INACTIVITY_DECAY_PER_ROUND: 0.996, // β

	// Point Differential Processing
	MAX_FULL_WEIGHT_DIFFERENTIAL: 5, // d_max

	// Team Strength Calculation
	MIN_TEAM_CONFIDENCE: 0.5, // C_min
	DEFAULT_TEAM_STRENGTH: 1200, // R_default
}
```

## Core Components

### 1. Player Rating State

Each player maintains the following state throughout calculations:

```typescript
interface PlayerRatingState {
	playerId: string // Unique player identifier
	playerName: string // Display name (cached)
	currentRating: number // Current ELO rating
	totalGames: number // Lifetime games played
	totalSeasons: number // Total seasons participated in
	seasonsPlayed: Set<string> // Track which seasons player has participated in
	lastSeasonId: string | null // Most recent season participated
	lastGameDate: Date | null // Track when player last played a game
	roundsSinceLastGame: number // Track rounds of inactivity
}
```

### 2. Game Processing Data

Games are processed with enhanced context information:

```typescript
interface GameProcessingData {
	id: string // Game identifier
	homeScore: number // Home team final score
	awayScore: number // Away team final score
	type: 'regular' | 'playoff' // Game type classification
	seasonOrder: number // 0 = current, 1 = previous, etc.
	gameDate: Date // When the game occurred
	season: DocumentReference // Season reference
	home: DocumentReference // Home team reference
	away: DocumentReference // Away team reference
}
```

### 3. Team Strength Metrics

Team strength is dynamically calculated for each game:

```typescript
interface TeamStrength {
	teamId: string // Team identifier
	averageRating: number // Average player rating
	playerCount: number // Number of rated players
	confidence: number // 0-1 based on rated player ratio
}
```

## Rating Calculation Process

The complete rating update formula combines all factors:

$$R_{\text{new}} = R_{\text{old}} + K \times \alpha^n \times f_p \times \left(S_{\text{actual}} - E\right)$$

Where:

- $S_{\text{actual}} = \text{clamp}\left(0.5 + \frac{d_{\text{weighted}}}{100}, 0, 1\right)$
- $E = \frac{1}{1 + 10^{(\bar{R}_{\text{opponent}} - \bar{R}_{\text{team}})/400}}$
- $d_{\text{weighted}}$ = point differential with diminishing returns
- $\bar{R}_{\text{team}}, \bar{R}_{\text{opponent}}$ = team average ratings

This process consists of five sequential steps:

### Step 1: Point Differential Weighting

Raw point differentials are processed through a diminishing returns function:

$$
\text{Weighted Differential} = \begin{cases}
d & \text{if } |d| \leq d_{\max} \\
\text{sign}(d) \times \left(d_{\max} + 2 \ln(|d| - d_{\max} + 1)\right) & \text{if } |d| > d_{\max}
\end{cases}
$$

Where:

- $d$ = raw point differential
- $d_{\max}$ = `MAX_FULL_WEIGHT_DIFFERENTIAL` (5)

```typescript
function calculateWeightedPointDifferential(rawDifferential: number): number {
	const absValue = Math.abs(rawDifferential)
	const sign = Math.sign(rawDifferential)

	if (absValue <= MAX_FULL_WEIGHT_DIFFERENTIAL) {
		return rawDifferential // Full weight for small differentials
	}

	// Logarithmic scaling for large differentials
	const scaledValue =
		MAX_FULL_WEIGHT_DIFFERENTIAL +
		Math.log(absValue - MAX_FULL_WEIGHT_DIFFERENTIAL + 1) * 2

	return sign * scaledValue
}
```

**Examples:**

- 3-point differential: No scaling (3.0)
- 8-point differential: Scaled to ~7.2
- 15-point differential: Scaled to ~9.5

### Step 2: Expected Score Calculation

Uses standard ELO expected score formula:

$$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$$

Where:

- $E_A$ = expected score for player/team A
- $R_A$ = rating of player/team A
- $R_B$ = rating of player/team B

```typescript
function calculateExpectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}
```

**Examples:**

- Equal ratings (1200 vs 1200): Expected score = 0.5
- 100-point advantage (1300 vs 1200): Expected score = 0.64
- 200-point advantage (1400 vs 1200): Expected score = 0.76

### Step 3: Actual Score Normalization

Point differentials are converted to a 0-1 scale for ELO comparison:

$$S_{\text{actual}} = \text{clamp}\left(0.5 + \frac{d_{\text{weighted}}}{100}, 0, 1\right)$$

Where:

- $S_{\text{actual}}$ = actual score (0-1 scale)
- $d_{\text{weighted}}$ = weighted point differential
- $\text{clamp}(x, a, b) = \max(a, \min(x, b))$

```typescript
const actualScore = 0.5 + pointDifferential / 100
const clampedActualScore = Math.max(0, Math.min(1, actualScore))
```

**Examples:**

- Win by 10 points: Actual score = 0.6
- Loss by 15 points: Actual score = 0.35
- Win by 50+ points: Actual score = 1.0 (clamped)

### Step 4: K-Factor Adjustment

The base K-factor is modified by temporal and game type factors:

$$K_{\text{effective}} = K_{\text{base}} \times f_{\text{season}} \times f_{\text{playoff}}$$

Where:

- $K_{\text{base}}$ = base K-factor (32)
- $f_{\text{season}} = \alpha^n$ = season decay factor
- $f_{\text{playoff}}$ = playoff multiplier (1.0 or 2.0)
- $\alpha$ = `SEASON_DECAY_FACTOR` (0.8)
- $n$ = season order (0 = current, 1 = previous, etc.)

```typescript
const kFactor = K_FACTOR * seasonDecayFactor * playoffMultiplier

// Where:
const seasonDecayFactor = Math.pow(SEASON_DECAY_FACTOR, game.seasonOrder)
const playoffMultiplier = game.type === 'playoff' ? PLAYOFF_MULTIPLIER : 1.0
```

**Examples:**

- Current season, regular game: K = 32 × 1.0 × 1.0 = 32
- Current season, playoff game: K = 32 × 1.0 × 2.0 = 64
- Previous season, regular game: K = 32 × 0.8 × 1.0 = 25.6

### Step 5: Final Rating Change

$$\Delta R = K_{\text{effective}} \times (S_{\text{actual}} - E)$$

$$R_{\text{new}} = R_{\text{old}} + \Delta R$$

Where:

- $\Delta R$ = rating change
- $R_{\text{new}}$ = updated player rating
- $R_{\text{old}}$ = previous player rating
- $E$ = expected score

```typescript
const ratingChange = kFactor * (clampedActualScore - expectedScore)
playerState.currentRating += ratingChange
```

## Team Strength Analysis

### Calculation Method

Team strength is computed as the average rating of all roster players, with historical adjustments:

$$\bar{R}_{\text{team}} = \frac{1}{n} \sum_{i=1}^{n} R_i^{\text{adj}}$$

Where $R_i^{\text{adj}}$ is the historically adjusted rating:

$$R_i^{\text{adj}} = R_{\text{start}} + (R_i - R_{\text{start}}) \times \alpha^n$$

And the confidence score is:

$$C = \frac{n_{\text{rated}}}{n_{\text{total}}}$$

Where:

- $\bar{R}_{\text{team}}$ = team average rating
- $n$ = number of roster players
- $R_i$ = current rating of player $i$
- $R_{\text{start}}$ = starting rating (1200)
- $\alpha$ = season decay factor (0.8)
- $n$ = season order
- $C$ = confidence score (0-1)
- $n_{\text{rated}}$ = number of players with ratings
- $n_{\text{total}}$ = total roster size

```typescript
async function calculateTeamStrength(
	teamRef: DocumentReference,
	gameDate: Date,
	playerRatings: Map<string, PlayerRatingState>,
	seasonOrder: number
): Promise<TeamStrength> {
	let totalRating = 0
	let ratedPlayerCount = 0

	for (const rosterEntry of roster) {
		const playerState = playerRatings.get(rosterEntry.player.id)

		if (playerState) {
			// Apply historical decay to player rating
			const decayFactor = Math.pow(SEASON_DECAY_FACTOR, seasonOrder)
			const adjustedRating =
				STARTING_RATING +
				(playerState.currentRating - STARTING_RATING) * decayFactor

			totalRating += adjustedRating
			ratedPlayerCount++
		} else {
			// Use starting rating for new/unrated players
			totalRating += STARTING_RATING
			ratedPlayerCount++
		}
	}

	const averageRating = totalRating / ratedPlayerCount
	const confidence = ratedPlayerCount / roster.length

	return { teamId, averageRating, playerCount: ratedPlayerCount, confidence }
}
```

### Confidence Scoring

Team strength confidence is based on the ratio of rated to total players:

- **High Confidence (0.8-1.0)**: Most players have established ratings
- **Medium Confidence (0.5-0.79)**: Mixed roster of rated and new players
- **Low Confidence (0-0.49)**: Mostly new players, uses default strength

## Point Differential Weighting

### Diminishing Returns Model

The algorithm applies logarithmic scaling to prevent extreme scores from dominating:

| Raw Differential | Weighted Differential | Scaling Factor |
| ---------------- | --------------------- | -------------- |
| ±3               | ±3.0                  | 1.00x          |
| ±5               | ±5.0                  | 1.00x          |
| ±8               | ±7.2                  | 0.90x          |
| ±10              | ±8.4                  | 0.84x          |
| ±15              | ±9.5                  | 0.63x          |
| ±20              | ±11.0                 | 0.55x          |

### Rationale

This approach ensures that:

1. **Close games matter most**: 1-point and 2-point games have full impact
2. **Blowouts are discounted**: 15+ point wins don't dominate rankings
3. **Skill differences show**: Consistent moderate wins still accumulate
4. **Outliers are minimized**: One extreme game can't drastically change ratings

## Season and Time-Based Factors

### Season Decay Factor

Each season back in time receives exponentially reduced weight:

$$f_{\text{season}} = \alpha^n$$

Where:

- $\alpha$ = `SEASON_DECAY_FACTOR` (0.82)
- $n$ = season order (0 = current, 1 = previous, etc.)

The effective K-factor becomes:

$$K_{\text{effective}} = K_{\text{base}} \times \alpha^n$$

| Season            | Decay Factor | Effective K-Factor |
| ----------------- | ------------ | ------------------ |
| Current (0)       | 1.00x        | 36.0               |
| Previous (1)      | 0.82x        | 29.5               |
| 2 Seasons Ago (2) | 0.67x        | 24.2               |
| 3 Seasons Ago (3) | 0.55x        | 19.8               |
| 4 Seasons Ago (4) | 0.45x        | 16.2               |

### Playoff Multiplier

Playoff games receive additional weight to reflect their importance:

- **Regular Season Games**: 1.0x multiplier
- **Playoff Games**: 1.8x multiplier

This means a playoff game rating change can be up to 65 points (K=36 × 1.8) versus 36 points for regular season.

### Chronological Processing

Games are processed in strict chronological order to ensure:

1. Player ratings evolve naturally over time
2. Team strength calculations use accurate historical ratings
3. Weekly snapshots capture true progression
4. No future information leaks into past calculations

## Round-Based Decay Mechanics

### Continuous Inactivity Decay

Players who don't participate in recent rounds experience gradual rating decay:

$$R_{\text{new}} = R_{\text{start}} + (R_{\text{old}} - R_{\text{start}}) \times \beta^r$$

Where:

- $R_{\text{new}}$ = rating after decay
- $R_{\text{old}}$ = rating before decay
- $R_{\text{start}}$ = starting rating (1200)
- $\beta$ = `INACTIVITY_DECAY_PER_ROUND` (0.996)
- $r$ = rounds of inactivity

### Decay Process

- **Per Round**: Each round a player doesn't play, their rating decays by 0.4%
- **Accumulative**: Decay compounds over multiple rounds of inactivity
- **Gradual**: No arbitrary thresholds or sudden status changes
- **Resumable**: When players return, decay stops and ratings can increase again

### Decay Examples

For a player with 1400 rating who becomes inactive:

| Rounds Inactive | Decay Factor | New Rating | Rating Lost |
| --------------- | ------------ | ---------- | ----------- |
| 0               | 1.000        | 1400       | 0           |
| 5               | 0.980        | 1396       | 4           |
| 10              | 0.961        | 1392       | 8           |
| 20              | 0.922        | 1384       | 16          |
| 40              | 0.851        | 1370       | 30          |

### Mathematical Properties

- **Base Rating Preserved**: Decay only affects rating above starting value (1200)
- **Continuous Function**: No jumps or discontinuities in rating changes
- **Predictable**: Players can calculate their expected rating after any period of inactivity
- **Fair**: All players experience identical decay rates regardless of skill level

## Round Snapshots and History

### Snapshot Creation

The system creates round-based snapshots during calculation:

```typescript
interface TimeBasedPlayerRanking {
	playerId: string // Player identifier
	playerName: string // Display name
	eloRating: number // Rating at this point
	rank: number // Position in rankings
	totalGames: number // Total games played up to this point
	totalSeasons: number // Total seasons participated in up to this point
}
```

### Historical Tracking

Round snapshots enable:

1. **Progress visualization**: See rating changes over time
2. **Performance analysis**: Identify trends and patterns
3. **Verification**: Audit trail for rating calculations
4. **Statistics**: Round-by-round performance metrics

## Calculation Flow

### Rebuild Process (Full)

1. **Initialize**: Load all seasons in chronological order
2. **Reset**: Clear all player ratings to starting values
3. **Process**: Handle each game chronologically across all seasons
4. **Decay**: Apply round-based decay for periods of inactivity
5. **Rank**: Sort players by final rating
6. **Snapshot**: Create round-based historical snapshots
7. **Save**: Store final rankings to database

### Update Process (Incremental)

1. **Load**: Retrieve existing ratings and last calculation point
2. **Identify**: Find new games since last calculation
3. **Process**: Apply new games to existing ratings
4. **Update**: Modify only affected player rankings
5. **Snapshot**: Add new round snapshots as needed

### Game Processing Order

Games must be processed in strict chronological order because:

- **Team Strength**: Later team strength depends on earlier rating updates
- **Historical Accuracy**: Player ratings evolve naturally over time
- **Snapshot Integrity**: Round snapshots reflect accurate progression
- **Consistency**: Results are deterministic and reproducible

## Technical Implementation

### Data Structures

#### Player Rating Map

```typescript
Map<string, PlayerRatingState> // playerId -> current state
```

#### Season Statistics

```typescript
Map<string, PlayerSeasonStats> // seasonId -> season performance
```

#### Team Strength Cache

```typescript
Map<string, TeamStrength> // teamId -> calculated strength
```

### Performance Optimizations

1. **Batch Processing**: Games processed in batches for efficiency
2. **Rating Caching**: Player ratings cached during calculation
3. **Team Strength Memoization**: Team calculations cached per game
4. **Database Batching**: Final rankings saved in batched writes
5. **Memory Management**: Large datasets processed in chunks

### Error Handling

- **Missing Data**: Graceful fallbacks for incomplete game data
- **Invalid Scores**: Skip games with null/invalid scores
- **Team Lookup Failures**: Use default strength when team data unavailable
- **Player Creation**: Automatic player state creation for new participants
- **Calculation Interruption**: State preserved for resumable calculations

### Validation and Integrity

- **Input Validation**: All game data validated before processing
- **Rating Bounds**: Ratings cannot go below reasonable minimums
- **Consistency Checks**: Verify calculation results match expectations
- **Audit Logging**: Comprehensive logging for debugging and verification
- **Rollback Capability**: Ability to revert to previous calculation states
- **Full Precision Storage**: ELO ratings stored as floating-point numbers to prevent cumulative rounding errors

---

## Summary

The Minneapolis Winter League Player Ranking Algorithm represents a sophisticated approach to individual performance evaluation in team sports. By incorporating point differentials, opponent strength, temporal factors, and round-based decay, it provides a nuanced and fair assessment of player skill that evolves appropriately over time.

The system's emphasis on recent performance, playoff importance, and mathematical rigor ensures that rankings accurately reflect current player capabilities while maintaining historical context. The round-based decay system provides continuous, predictable rating adjustments without arbitrary thresholds or status classifications.

Key features of the current algorithm:

- **Round-Based Decay**: Continuous 0.4% decay per round of inactivity
- **Optimized Constants**: K-factor of 36, season decay of 0.82, playoff multiplier of 1.8
- **Point Differential Focus**: Maximum weight for differentials up to 5 points
- **No Activity Status**: All players ranked by current rating without classification
- **Comprehensive Snapshots**: Round-by-round historical tracking for transparency

This algorithm serves as both a competitive ranking system and a historical record of player development within the Minneapolis Winter League community, providing fair and mathematically sound player evaluations.
