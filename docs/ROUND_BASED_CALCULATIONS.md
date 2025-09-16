# Round-Based Player Rankings Calculation System

## Overview

The Minneapolis Winter League Player Rankings system now supports **round-based calculations** that process games iteratively by chronological round (sets of games that start at the same time). This provides true chronological order, prevents duplicate calculations, and enables efficient incremental updates.

## Key Features

### 1. True Chronological Order

- Games are grouped by their exact start time into "rounds"
- All games in a round are processed simultaneously before moving to the next round
- Ensures ratings are calculated in proper temporal sequence

### 2. Duplicate Prevention

- Each round is tracked in the `calculated-rounds` collection
- System can detect which rounds have already been processed
- Prevents accidental recalculation of existing data

### 3. Incremental Updates

- New games can be added and only the new rounds are calculated
- Existing calculations remain untouched
- Significantly faster for ongoing league operations

## Calculation Types

### Full Calculation (`calculationType: "full"`)

Processes all games chronologically (traditional method)

```javascript
{
  calculationType: "full",
  applyDecay: true
}
```

### Incremental Calculation (`calculationType: "incremental"`)

Processes games from a specific starting point (traditional method)

```javascript
{
  calculationType: "incremental",
  startSeasonId: "2023-fall",
  startWeek: 5,
  applyDecay: false
}
```

### Round-Based Calculation (`calculationType: "round-based"`)

Processes games by rounds in chronological order

```javascript
{
  calculationType: "round-based",
  applyDecay: true,
  onlyNewRounds: false  // true for incremental
}
```

## Available Functions

### 1. `calculateHallOfFameRankings`

The main calculation function with round-based support.

**Parameters:**

- `calculationType`: `"full"` | `"incremental"` | `"round-based"`
- `applyDecay`: boolean (default: true)
- `startSeasonId`: string (optional, for incremental)
- `startWeek`: number (optional, for incremental)
- `onlyNewRounds`: boolean (default: false, for round-based)

**Examples:**

```javascript
// Full round-based calculation
await calculateHallOfFameRankings({
	calculationType: 'round-based',
	applyDecay: true,
	onlyNewRounds: false,
})

// Incremental round-based calculation
await calculateHallOfFameRankings({
	calculationType: 'round-based',
	applyDecay: false,
	onlyNewRounds: true,
})
```

### 2. `calculateHallOfFameIterative`

Simplified function for iterative calculations (processes only new rounds).

**Parameters:**

- `onlyNewRounds`: boolean (default: true)
- `applyDecay`: boolean (default: true)

**Example:**

```javascript
// Process only new rounds
await calculateHallOfFameIterative({
	onlyNewRounds: true,
	applyDecay: false,
})
```

### 3. `getRoundCalculationStatus`

Debug function to check calculation status.

**Parameters:**

- `seasonId`: string (optional)

**Examples:**

```javascript
// Overall status
const status = await getRoundCalculationStatus()
// Returns: { totalRounds, calculatedRounds, uncalculatedRounds, lastCalculatedTime }

// Season-specific status
const seasonStatus = await getRoundCalculationStatus({ seasonId: '2023-fall' })
// Returns: { seasonId, calculatedRounds, rounds: [...], lastCalculatedTime }
```

## Database Collections

### `calculated-rounds`

Tracks which rounds have been processed to prevent duplication.

**Document Structure:**

```typescript
{
  roundId: string,           // Unique round identifier (timestamp)
  roundStartTime: Timestamp, // When games in this round started
  seasonId: string,          // Season ID
  week: number,              // Week number
  gameCount: number,         // Number of games in round
  calculatedAt: Timestamp,   // When calculation was performed
  calculationId: string,     // ID of calculation that processed this round
  gameIds: string[]          // IDs of games processed
}
```

## Usage Scenarios

### Initial Setup

When setting up rankings for the first time:

```javascript
await calculateHallOfFameRankings({
	calculationType: 'round-based',
	applyDecay: true,
	onlyNewRounds: false,
})
```

### Regular Updates

After adding new games to the system:

```javascript
await calculateHallOfFameIterative({
	onlyNewRounds: true,
	applyDecay: false,
})
```

### Checking Progress

To see what's been calculated:

```javascript
const status = await getRoundCalculationStatus()
console.log(
	`${status.calculatedRounds}/${status.totalRounds} rounds calculated`
)
```

### Season-Specific Analysis

To check a specific season:

```javascript
const seasonStatus = await getRoundCalculationStatus({
	seasonId: '2023-fall',
})
```

## Benefits

1. **Accuracy**: True chronological processing ensures ratings reflect actual game sequence
2. **Efficiency**: Incremental processing only calculates new rounds
3. **Safety**: Duplicate prevention avoids corruption from multiple calculations
4. **Debugging**: Clear tracking of what's been calculated and when
5. **Scalability**: Better performance for large datasets
6. **Flexibility**: Can process full rebuilds or incremental updates

## Migration

Existing calculations continue to work unchanged. The round-based system is additive and doesn't affect existing functionality. Simply use `calculationType: "round-based"` to opt into the new system.

## Implementation Details

### Round Grouping

Games are grouped by exact timestamp (millisecond precision):

```typescript
// Games starting at exactly the same time are grouped together
const rounds = groupGamesByRounds(games)
// Each round contains all games with identical start times
```

### Processing Order

1. Group all games by exact start time
2. Sort rounds chronologically
3. Process each round completely before moving to next
4. Track completion in `calculated-rounds` collection
5. Update player ratings after each round

### Error Handling

If a round fails to process:

- The round is not marked as calculated
- Subsequent runs will retry the failed round
- No partial state corruption occurs
