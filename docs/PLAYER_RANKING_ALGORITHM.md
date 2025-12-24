# Player Ranking Algorithm - Technical Specification

> **Minneapolis Winter League Player Rankings Rating System**
>
> A TrueSkill-based Bayesian player ranking algorithm that evaluates individual performance across seasons, considering team outcomes, uncertainty estimation, playoff performance, and round-based inactivity decay.

## Table of Contents

- [Mathematical Notation](#mathematical-notation)
- [Overview](#overview)
- [Algorithm Constants](#algorithm-constants)
- [Core Components](#core-components)
- [TrueSkill Rating Calculation](#trueskill-rating-calculation)
- [Team Skill Aggregation](#team-skill-aggregation)
- [Season and Time-Based Factors](#season-and-time-based-factors)
- [Round-Based Decay Mechanics](#round-based-decay-mechanics)
- [Round Snapshots and History](#round-snapshots-and-history)
- [Calculation Flow](#calculation-flow)
- [Technical Implementation](#technical-implementation)

## Mathematical Notation

| Symbol                             | Description                                      |
| ---------------------------------- | ------------------------------------------------ |
| $\mu$                              | Player skill estimate (mean of Gaussian)         |
| $\sigma$                           | Skill uncertainty (standard deviation)           |
| $\mu_0$                            | Initial skill estimate (25.0)                    |
| $\sigma_0$                         | Initial uncertainty (8.333)                      |
| $\beta$                            | Performance variance (4.167)                     |
| $\tau$                             | Dynamics factor (0.0833)                         |
| $\epsilon$                         | Draw probability margin                          |
| $\alpha$                           | Season decay factor (0.8)                        |
| $\gamma$                           | Gravity well decay per round (0.998)             |
| $\delta$                           | Inactivity decay per round (0.992)               |
| $f_{\text{playoff}}$               | Playoff multiplier (2.0)                         |
| $n$                                | Season order (0 = current)                       |
| $\Phi(x)$                          | Standard normal CDF                              |
| $\phi(x)$                          | Standard normal PDF                              |

## Overview

The Minneapolis Winter League employs **TrueSkill**, a Bayesian skill rating system developed by Microsoft Research. Unlike traditional ELO systems, TrueSkill:

- **Models uncertainty**: Each player has both a skill estimate (μ) and an uncertainty measure (σ)
- **Handles team games**: Infers individual skill from team-level outcomes
- **Updates appropriately**: New players with high uncertainty change ratings quickly; established players change slowly
- **Supports draws**: Handles tie games mathematically

### Key Concepts

1. **Gaussian Skill Representation**: Each player's true skill is modeled as a probability distribution $N(\mu, \sigma^2)$
2. **Team Skill Aggregation**: Team performance is the sum of individual player skills
3. **Bayesian Updating**: After each game, player distributions are updated based on the match outcome
4. **Uncertainty Reduction**: Sigma decreases as more games are played, reflecting increased confidence
5. **Playoff Amplification**: Postseason games have 2x rating impact
6. **Asymmetric Decay**: Ratings drift toward baseline differently for active vs inactive players

## Algorithm Constants

The following constants define the behavior of the rating system:

| Constant                         | Symbol               | Value   | Description                              |
| -------------------------------- | -------------------- | ------- | ---------------------------------------- |
| `INITIAL_MU`                     | $\mu_0$              | 25.0    | Initial skill estimate for new players   |
| `INITIAL_SIGMA`                  | $\sigma_0$           | 8.333   | Initial uncertainty (μ/3)                |
| `BETA`                           | $\beta$              | 4.167   | Performance variance (σ/2)               |
| `TAU`                            | $\tau$               | 0.0833  | Dynamics factor (σ/100)                  |
| `DRAW_PROBABILITY_EPSILON`       | $\epsilon$           | 0.001   | Draw probability margin                  |
| `MIN_SIGMA`                      | $\sigma_{\min}$      | 0.01    | Minimum sigma floor                      |
| `MAX_SIGMA`                      | $\sigma_{\max}$      | 8.333   | Maximum sigma (cannot exceed initial)    |
| `PLAYOFF_MULTIPLIER`             | $f_p$                | 2.0     | Playoff games have 2x impact             |
| `SEASON_DECAY_FACTOR`            | $\alpha$             | 0.8     | Each past season weighted at 80%         |
| `GRAVITY_WELL_PER_ROUND`         | $\gamma$             | 0.998   | 0.2% drift toward baseline per round     |
| `INACTIVITY_DECAY_PER_ROUND`     | $\delta$             | 0.992   | 0.8% decay per inactive round            |
| `SIGMA_INCREASE_PER_INACTIVE_ROUND` | -                 | 1.002   | 0.2% uncertainty increase when inactive  |

```typescript
TRUESKILL_CONSTANTS = {
	// Core TrueSkill Parameters
	INITIAL_MU: 25.0,                      // μ₀
	INITIAL_SIGMA: 25.0 / 3.0,             // σ₀ = μ/3
	BETA: 25.0 / 6.0,                      // β = σ/2
	TAU: 25.0 / 300.0,                     // τ = σ/100
	DRAW_PROBABILITY_EPSILON: 0.001,       // ε
	MIN_SIGMA: 0.01,                       // σ_min
	MAX_SIGMA: 25.0 / 3.0,                 // σ_max

	// Game Type Multipliers
	PLAYOFF_MULTIPLIER: 2.0,               // f_p

	// Temporal Decay Factors
	SEASON_DECAY_FACTOR: 0.8,              // α
	GRAVITY_WELL_PER_ROUND: 0.998,         // γ
	INACTIVITY_DECAY_PER_ROUND: 0.992,     // δ
	SIGMA_INCREASE_PER_INACTIVE_ROUND: 1.002,
}
```

## Core Components

### 1. Player Rating State

Each player maintains the following state throughout calculations:

```typescript
interface PlayerRatingState {
	playerId: string                   // Unique player identifier
	playerName: string                 // Display name (cached)
	mu: number                         // Skill estimate (mean of Gaussian)
	sigma: number                      // Uncertainty (standard deviation)
	totalGames: number                 // Lifetime games played
	totalSeasons: number               // Total seasons participated in
	seasonsPlayed: Set<string>         // Which seasons player participated in
	lastSeasonId: string | null        // Most recent season participated
	lastGameDate: Date | null          // When player last played
	roundsSinceLastGame: number        // Rounds of inactivity
}
```

### 2. TrueSkill Rating

The fundamental unit of skill measurement:

```typescript
interface TrueSkillRating {
	mu: number      // Mean (estimated skill) - higher is better
	sigma: number   // Standard deviation (uncertainty) - lower is more confident
}
```

### 3. Game Processing Data

Games are processed with enhanced context information:

```typescript
interface GameProcessingData {
	id: string                     // Game identifier
	homeScore: number | null       // Home team final score
	awayScore: number | null       // Away team final score
	type: 'regular' | 'playoff'    // Game type classification
	seasonOrder: number            // 0 = current, 1 = previous, etc.
	gameDate: Date                 // When the game occurred
	season: DocumentReference      // Season reference
	home: DocumentReference        // Home team reference
	away: DocumentReference        // Away team reference
}
```

## TrueSkill Rating Calculation

### Team Skill Aggregation

Team skill is calculated as the sum of individual player skills:

$$\mu_{\text{team}} = \sum_{i=1}^{n} \mu_i$$

Team uncertainty combines individual uncertainties with performance variance:

$$\sigma_{\text{team}} = \sqrt{\sum_{i=1}^{n} \sigma_i^2 + n \cdot \beta^2}$$

### Rating Update Process

1. **Calculate Team Statistics**:
   - Winner team: $\mu_W$, $\sigma_W$
   - Loser team: $\mu_L$, $\sigma_L$

2. **Compute Total Variance**:
   $$\sigma_{\text{total}} = \sqrt{\sigma_W^2 + \sigma_L^2 + 2\tau^2}$$

3. **Calculate Normalized Performance Difference**:
   $$t = \frac{\mu_W - \mu_L}{\sigma_{\text{total}}}$$

4. **Compute Update Factors** (v and w functions):
   - For wins: $v = \frac{\phi(t - \epsilon)}{\Phi(t - \epsilon)}$, $w = v(v + t - \epsilon)$
   - For draws: Uses symmetric truncated Gaussian formulas

5. **Update Individual Ratings**:
   For each player $i$ on the winning team:
   $$\mu_i^{\text{new}} = \mu_i + \frac{\sigma_i^2}{\sigma_{\text{total}}^2} \cdot v \cdot f_p \cdot \sigma_{\text{total}}$$
   $$\sigma_i^{\text{new}} = \sqrt{\sigma_i^2 \left(1 - w \cdot \frac{\sigma_i^2}{\sigma_{\text{total}}^2}\right)}$$

   For losing team, the mu update is negated.

### Update Properties

- **Winners**: Skill estimate increases, uncertainty decreases
- **Losers**: Skill estimate decreases, uncertainty decreases
- **Upsets**: Larger updates when lower-rated team wins
- **Expected outcomes**: Smaller updates when favorite wins
- **New players**: Change quickly due to high sigma
- **Established players**: Change slowly due to low sigma

## Season and Time-Based Factors

### Season Decay Factor

Games from older seasons have reduced impact:

$$\text{Combined Multiplier} = f_{\text{playoff}} \times \alpha^n$$

Where:
- $f_{\text{playoff}}$ = 2.0 for playoff games, 1.0 otherwise
- $\alpha$ = 0.8 (season decay factor)
- $n$ = season order (0 = current, 1 = previous, etc.)

| Season            | Decay Factor | Regular Game | Playoff Game |
| ----------------- | ------------ | ------------ | ------------ |
| Current (0)       | 1.00x        | 1.0x         | 2.0x         |
| Previous (1)      | 0.80x        | 0.8x         | 1.6x         |
| 2 Seasons Ago (2) | 0.64x        | 0.64x        | 1.28x        |
| 3 Seasons Ago (3) | 0.51x        | 0.51x        | 1.02x        |

### Chronological Processing

Games are processed in strict chronological order to ensure:
1. Player ratings evolve naturally over time
2. Uncertainty decreases appropriately with games played
3. Round snapshots capture true progression
4. No future information leaks into past calculations

## Round-Based Decay Mechanics

### Asymmetric Gravity Well

All ratings drift toward the initial baseline ($\mu_0 = 25$) over time, but the rate differs based on activity and position:

**Players Above Baseline** ($\mu > \mu_0$):
- Active: Slow decay ($\gamma = 0.998$) - reward for playing
- Inactive: Fast decay ($\delta = 0.992$) - penalty for absence

**Players Below Baseline** ($\mu < \mu_0$):
- Active: Fast recovery ($\delta = 0.992$) - reward for playing
- Inactive: Slow recovery ($\gamma = 0.998$) - penalty for absence

This creates a "gravity well" that:
- Keeps active high-performers near their earned ratings
- Allows inactive players to slowly regress toward average
- Encourages participation for players below average

### Uncertainty Growth for Inactivity

Inactive players gain uncertainty over time:

$$\sigma^{\text{new}} = \min(\sigma \times 1.002, \sigma_{\max})$$

This reflects decreased confidence in their current skill level when they haven't played recently.

### Decay Application

Decay is applied once per round (group of games):

```typescript
for each round:
    for each player:
        if player played in this round:
            reset inactivity counter
        else:
            apply appropriate decay to mu
            increase sigma slightly
```

## Round Snapshots and History

### Snapshot Structure

Round-based snapshots capture the state after each game round:

```typescript
interface TimeBasedPlayerRanking {
	playerId: string
	playerName: string
	rating: number             // TrueSkill μ (skill estimate)
	rank: number
	totalGames: number
	totalSeasons: number
	change?: number            // Rating change from previous
	previousRating?: number    // Rating before this round
}
```

### Historical Tracking

Round snapshots enable:
1. **Progress visualization**: See rating evolution over time
2. **Performance analysis**: Identify trends and patterns
3. **Verification**: Audit trail for rating calculations
4. **Statistics**: Round-by-round performance metrics

## Calculation Flow

### Rebuild Process (Full)

1. **Initialize**: Load all seasons in chronological order
2. **Reset**: Clear all player ratings to initial values ($\mu_0$, $\sigma_0$)
3. **Group**: Organize games by round (date/time)
4. **Process Each Round**:
   - Apply decay to all players
   - Process each game in the round
   - Create round snapshot
5. **Rank**: Sort players by final μ value
6. **Save**: Store final rankings to database

### Game Processing Logic

```typescript
for each game in round:
    1. Get rosters for home and away teams
    2. Determine outcome (home win, away win, or draw)
    3. Calculate multiplier (playoff × season decay)
    4. Call TrueSkill updateRatings()
    5. Apply new μ and σ to player states
    6. Update game counts and season tracking
```

### Processing Order

Games must be processed in strict chronological order because:
- **Uncertainty Evolution**: Sigma must decrease appropriately over games
- **Historical Accuracy**: Player ratings evolve naturally
- **Snapshot Integrity**: Round snapshots reflect true progression
- **Consistency**: Results are deterministic and reproducible

## Technical Implementation

### Data Structures

#### Player Rating Map
```typescript
Map<string, PlayerRatingState>  // playerId -> current state
```

#### TrueSkill Rating Operations
```typescript
// Create new rating
createRating(mu?, sigma?) -> TrueSkillRating

// Update ratings after game
updateRatings(winners[], losers[], isDraw, multiplier)
    -> { winners: TrueSkillRating[], losers: TrueSkillRating[] }

// Win probability calculation
winProbability(teamA[], teamB[]) -> number (0-1)
```

### Performance Optimizations

1. **Batch Processing**: Games processed in batches per round
2. **Rating Caching**: Player ratings cached during calculation
3. **Database Batching**: Final rankings saved in batched writes
4. **Precision Handling**: Ratings compared with multiplier (1,000,000) to handle floating point

### Error Handling

- **Missing Data**: Graceful fallbacks for incomplete game data
- **Invalid Scores**: Skip games with null/invalid scores
- **Player Creation**: Automatic player state creation for new participants
- **Sigma Bounds**: Sigma clamped between MIN_SIGMA and MAX_SIGMA

### Validation and Integrity

- **Input Validation**: All game data validated before processing
- **Consistency Checks**: Verify calculation results match expectations
- **Audit Logging**: Comprehensive logging for debugging and verification
- **Full Precision Storage**: Ratings stored as floating-point numbers

---

## Summary

The Minneapolis Winter League Player Ranking Algorithm uses Microsoft's TrueSkill Bayesian rating system to provide fair and mathematically rigorous player evaluations. Key features:

- **Bayesian Skill Modeling**: Each player represented by $N(\mu, \sigma^2)$
- **Uncertainty Tracking**: Confidence in ratings increases with more games
- **Team-Based Inference**: Individual skill inferred from team outcomes
- **Asymmetric Gravity Well**: Rewards active participation, penalizes inactivity
- **Playoff Amplification**: 2x impact for postseason games
- **Season Decay**: Recent seasons weighted more heavily (80% decay)
- **Comprehensive Snapshots**: Round-by-round historical tracking

This algorithm serves as both a competitive ranking system and a historical record of player development within the Minneapolis Winter League community.

---

*Reference: [TrueSkill Rating System](https://trueskill.org/) by Microsoft Research*
