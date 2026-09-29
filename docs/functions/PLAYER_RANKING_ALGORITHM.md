# Player Ranking Algorithm - Technical Specification

> **Minneapolis Winter League Player Rankings Rating System**
>
> A TrueSkill-based Bayesian player ranking algorithm (v6) that evaluates individual performance across seasons, considering team outcomes, uncertainty estimation, playoff performance, round-based inactivity decay and a carry-over between seasons. Every rating is computed only from the games before it, so past ratings never change when seasons are added.

## Table of Contents

- [Mathematical Notation](#mathematical-notation)
- [Overview](#overview)
- [Algorithm Constants](#algorithm-constants)
- [Core Components](#core-components)
- [TrueSkill Rating Calculation](#trueskill-rating-calculation)
- [Team Skill Aggregation](#team-skill-aggregation)
- [Season and Time-Based Factors](#season-and-time-based-factors)
- [Round-Based Decay Mechanics](#round-based-decay-mechanics)
- [What a Rebuild Saves](#what-a-rebuild-saves)
- [Calculation Flow](#calculation-flow)
- [Technical Implementation](#technical-implementation)

## Mathematical Notation

| Symbol               | Description                              |
| -------------------- | ---------------------------------------- |
| $\mu$                | Player skill estimate (mean of Gaussian) |
| $\sigma$             | Skill uncertainty (standard deviation)   |
| $\mu_0$              | Initial skill estimate (25.0)            |
| $\sigma_0$           | Initial uncertainty (8.333)              |
| $\beta$              | Performance variance (4.167)             |
| $\tau$               | Dynamics factor (0.0833)                 |
| $\epsilon$           | Draw probability margin                  |
| $\kappa$             | Season carry-over (0.95)                 |
| $\gamma$             | Gravity well decay per round (0.998)     |
| $\delta$             | Inactivity decay per round (0.992)       |
| $f_{\text{playoff}}$ | Playoff multiplier (2.0)                 |
| $\Phi(x)$            | Standard normal CDF                      |
| $\phi(x)$            | Standard normal PDF                      |

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

| Constant                            | Symbol          | Value  | Description                             |
| ----------------------------------- | --------------- | ------ | --------------------------------------- |
| `INITIAL_MU`                        | $\mu_0$         | 25.0   | Initial skill estimate for new players  |
| `INITIAL_SIGMA`                     | $\sigma_0$      | 8.333  | Initial uncertainty (μ/3)               |
| `BETA`                              | $\beta$         | 4.167  | Performance variance (σ/2)              |
| `TAU`                               | $\tau$          | 0.0833 | Dynamics factor (σ/100)                 |
| `DRAW_PROBABILITY_EPSILON`          | $\epsilon$      | 0.001  | Draw probability margin                 |
| `MIN_SIGMA`                         | $\sigma_{\min}$ | 0.01   | Minimum sigma floor                     |
| `MAX_SIGMA`                         | $\sigma_{\max}$ | 8.333  | Maximum sigma (cannot exceed initial)   |
| `PLAYOFF_MULTIPLIER`                | $f_p$           | 2.0    | Playoff games have 2x impact            |
| `SEASON_CARRY_OVER`                 | $\kappa$        | 0.95   | Share of a rating carried into a season |
| `GRAVITY_WELL_PER_ROUND`            | $\gamma$        | 0.998  | 0.2% drift toward baseline per round    |
| `INACTIVITY_DECAY_PER_ROUND`        | $\delta$        | 0.992  | 0.8% decay per inactive round           |
| `SIGMA_INCREASE_PER_INACTIVE_ROUND` | -               | 1.002  | 0.2% uncertainty increase when inactive |

```typescript
TRUESKILL_CONSTANTS = {
	// Core TrueSkill Parameters
	INITIAL_MU: 25.0, // μ₀
	INITIAL_SIGMA: 25.0 / 3.0, // σ₀ = μ/3
	BETA: 25.0 / 6.0, // β = σ/2
	TAU: 25.0 / 300.0, // τ = σ/100
	DRAW_PROBABILITY_EPSILON: 0.001, // ε
	MIN_SIGMA: 0.01, // σ_min
	MAX_SIGMA: 25.0 / 3.0, // σ_max

	// Game Type Multipliers
	PLAYOFF_MULTIPLIER: 2.0, // f_p

	// Temporal Decay Factors
	SEASON_CARRY_OVER: 0.95, // κ
	GRAVITY_WELL_PER_ROUND: 0.998, // γ
	INACTIVITY_DECAY_PER_ROUND: 0.992, // δ
	SIGMA_INCREASE_PER_INACTIVE_ROUND: 1.002,
}
```

## Core Components

### 1. Player Rating State

Each player maintains the following state throughout calculations:

```typescript
interface PlayerRatingState {
	playerId: string // Unique player identifier
	playerName: string // Display name (cached)
	mu: number // Skill estimate (mean of Gaussian)
	sigma: number // Uncertainty (standard deviation)
	totalGames: number // Lifetime games played
	totalSeasons: number // Total seasons participated in
	seasonsPlayed: Set<string> // Which seasons player participated in
	lastSeasonId: string | null // Most recent season participated
	lastGameDate: Date | null // When player last played
	roundsSinceLastGame: number // Rounds of inactivity
}
```

### 2. TrueSkill Rating

The fundamental unit of skill measurement:

```typescript
interface TrueSkillRating {
	mu: number // Mean (estimated skill) - higher is better
	sigma: number // Standard deviation (uncertainty) - lower is more confident
}
```

### 3. Engine Input

The engine (`engine/rankingEngine.ts`) never reads Firestore. The rebuild
loads every game, every roster entry and every rostered player's name, then
hands the engine plain data:

```typescript
interface EngineInput {
	games: EngineGame[] // id, seasonId, date, type, home/away team ids, scores
	rosters: Map<string, string[]> // `${teamId}/${seasonId}` -> player ids
	playerNames: Map<string, string> // a rostered player without one is skipped
}
```

A game credits every player on each team's roster for that season. There is
no per-game attendance, so teammates who have always played together have
identical histories and identical ratings.

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

### Season Carry-Over

At the first round of each new season, every rating moves part of the way back
toward the baseline:

$$\mu^{\text{new}} = \mu_0 + (\mu - \mu_0) \times \kappa$$

With $\kappa = 0.95$, a rating keeps 95% of its distance from 25.0 into the
next season. Recent seasons therefore count for more, and a rating is still
computed only from what came before it.

**Why not discount old games?** Until v6 each game's rating movement was
scaled by $0.8^n$, where $n$ counted seasons back from the newest one when the
rebuild ran. Adding a season, even one with no games yet, changed $n$ for every
past game, so every past rating and ranking shifted. Measured on production
data, creating 2026 Fall moved 396 of 444 players, and 2025 Fall's final
standings changed for 140 of its 189 players when 2026 Spring was added. The
discount also scaled only the rating movement, not the drop in uncertainty, so
an old game still counted in full toward confidence.

$\kappa = 0.95$ was chosen as the value that kept v6 closest to the v5
leaderboard it replaced: rank correlation 0.989, half of all players within
five places. An uncertainty increase at each season boundary was tried first
and does almost nothing here: with twelve-player teams, $\sigma$ stays near
its maximum (median 8.19 of 8.33), so there is no room for it to grow.

### Playoff Multiplier

Playoff games move ratings twice as far: the TrueSkill $v$ term is multiplied
by $f_p = 2.0$.

### Chronological Processing

Games are processed in strict chronological order to ensure:

1. Player ratings evolve naturally over time
2. Uncertainty decreases appropriately with games played
3. Each round's ratings are exactly what they were at the time
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

## What a Rebuild Saves

The engine returns every rated player's state after every round.
`engine/projections.ts` turns that into four outputs, and
`persistence/rankingsSaver.ts` writes them, deleting anything the rebuild no
longer produces:

| Collection                               | One document per | Holds                                                                     |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `rankings/{playerId}`                    | player           | All-time rating and rank, games, seasons, change over the last game night |
| `player-ranking-history/{playerId}`      | player           | Every round since their first game: rating, all-time rank, season rank    |
| `seasons/{seasonId}/rankings/{playerId}` | rostered player  | Rank that season, rating, rating change, games, wins, losses              |
| `rankings-history/{roundId}_{seasonId}`  | round            | Every player's rating after the round; no longer read (retiring)          |

**On the site**, `/players` and `/players/{id}` switch between all time and
one season with `?season=<id>` (`features/public/rankings/`). All time reads
`rankings`; a season reads `seasons/{seasonId}/rankings`. A player's page reads
their one `player-ranking-history` document and charts all-time rank, or,
for a season, season rank, and pairs each round with the game their team
played at that kickoff to show the result and what it did to their rating.

**Season rank** ranks a round's players among everyone on a roster that season
who has a rating. Ranking only those who had played so far would leave half the
league unranked after the first 6:00 games. A player not rostered that season
has no season rank.

**Rating change in a season** is measured from the rating carried into it, or
from 25.0 for a new player.

**Last rating change**, on the leaderboard, is the change over the most recent
game night: every round on that calendar day in Minneapolis. It is computed
from the games, so a rebuild with nothing new to count leaves it unchanged.

## Calculation Flow

`services/playerRankings/rebuild.ts` runs a rebuild, from the admin's Rebuild
button (`rebuildPlayerRankings`) or every night at 23:00 Central
(`rebuildRankingsNightly`). A rebuild is refused while another is running;
one running for more than 15 minutes is taken to have died.

1. **Load**: every season, game and roster entry, and every rostered player's name
2. **Group**: completed games into rounds by exact start time
3. **Process each round**:
   - At a new season, apply the carry-over
   - Apply round decay to every rated player
   - Play each game: TrueSkill update, games and wins counted
   - Record every player's state
4. **Project**: leaderboard, histories, season standings
5. **Save**: through a BulkWriter, failing the rebuild if any write fails

The output depends only on the games and rosters, so rebuilding twice gives the
same result.

## Technical Implementation

| Module                            | Does                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `algorithms/trueskill.ts`         | `updateRatings(winners, losers, multiplier)`                |
| `algorithms/decay.ts`             | `applyRoundBasedDecay`: the gravity well and inactivity     |
| `engine/rankingEngine.ts`         | `runRankings(input)`: every round, from plain data          |
| `engine/projections.ts`           | `projectRankings`: leaderboard, histories, season standings |
| `utils/rankCalculator.ts`         | Ranks with ties: equal ratings share a rank (1, 1, 3)       |
| `persistence/inputLoader.ts`      | Reads the engine's input from Firestore                     |
| `persistence/rankingsSaver.ts`    | Writes the outputs and deletes what is no longer produced   |
| `persistence/calculationState.ts` | The `rankings-calculations` progress document               |
| `rebuild.ts`                      | One rebuild, end to end                                     |

Ratings are compared at a precision of $10^{-6}$ when ranking, so floating
point noise cannot split a tie. Games without both scores are ignored, a game
with an empty roster on either side is skipped, and $\sigma$ is clamped between
`MIN_SIGMA` and `MAX_SIGMA`.

---

## Summary

The Minneapolis Winter League Player Ranking Algorithm uses Microsoft's TrueSkill Bayesian rating system to provide fair and mathematically rigorous player evaluations. Key features:

- **Bayesian Skill Modeling**: Each player represented by $N(\mu, \sigma^2)$
- **Uncertainty Tracking**: Confidence in ratings increases with more games
- **Team-Based Inference**: Individual skill inferred from team outcomes
- **Asymmetric Gravity Well**: Rewards active participation, penalizes inactivity
- **Playoff Amplification**: 2x impact for postseason games
- **Season Carry-Over**: Recent seasons count for more, without rewriting the past
- **Per-Player History and Season Standings**: Every round, all-time and within each season

This algorithm serves as both a competitive ranking system and a historical record of player development within the Minneapolis Winter League community.

---

_Reference: [TrueSkill Rating System](https://trueskill.org/) by Microsoft Research_
