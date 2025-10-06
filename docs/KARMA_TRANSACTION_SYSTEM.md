# Karma Transaction System

## Overview

The karma transaction system provides a historical log of all karma additions and subtractions for teams. This ensures that karma is only subtracted when it was previously awarded, preventing unfair deductions.

## Requirements

A player qualifies for karma bonus when joining a team if ALL of the following are true:

- `lookingForTeam: true`
- `paid: true` (has paid for the season)
- `signed: true` (has signed the waiver)

When a qualifying player joins a team, the team receives **+100 karma** and a transaction is logged.

When a player leaves a team, the system checks if there's a matching karma transaction from when they joined. If found, **-100 karma** is subtracted (minimum 0) and a reversal transaction is logged.

## Data Structure

### KarmaTransaction Interface

```typescript
interface KarmaTransaction {
	player: DocumentReference<PlayerDocument>
	team: DocumentReference<TeamDocument>
	amount: number // positive for additions, negative for subtractions
	reason: 'player_joined' | 'player_left'
	timestamp: Timestamp
	season: DocumentReference<SeasonDocument>
}
```

### Storage Location

Karma transactions are stored as a **subcollection** under each team document:

```
teams/{teamId}/karma_transactions/{transactionId}
```

## Implementation Details

### New Files Created

1. **`Functions/src/shared/karma.ts`**
   - `createKarmaTransaction()` - Creates a transaction record
   - `findKarmaTransactionForPlayerJoin()` - Checks if karma was awarded when player joined
   - `isPlayerFullyRegistered()` - Checks if player has paid and signed
   - `qualifiesForKarmaBonus()` - Determines if player qualifies for karma
   - `KARMA_AMOUNT` constant (100)

2. **`Functions/src/types.ts`**
   - Added `KarmaTransaction` interface

### Modified Functions

#### 1. `manageTeamPlayer` (Functions/src/functions/teams/managePlayer.ts)

**Remove Action:**

- Before removing a player, queries `karma_transactions` to check if team was awarded karma when player joined
- Only subtracts karma if a matching transaction exists
- Creates a reversal transaction with `reason: 'player_left'` and negative amount
- Logs karma adjustment in function output

**Key Changes:**

- Added imports for karma utility functions
- Updated `handleRemoveFromTeam()` signature to accept season ref and karma transaction
- Added async query to find karma transaction before calling `handleRemoveFromTeam()`
- Conditional karma subtraction based on transaction history

#### 2. `onOfferUpdated` (Functions/src/triggers/documents/offerUpdated.ts)

**When Player Accepts Offer:**

- Uses `qualifiesForKarmaBonus()` to check all requirements (lookingForTeam, paid, signed)
- Only awards karma if player qualifies
- Creates transaction record with `reason: 'player_joined'` and positive amount
- Logs karma bonus in trigger output

**Key Changes:**

- Added imports for karma utility functions
- Replaced manual `isLookingForTeam` check with `qualifiesForKarmaBonus()` helper
- Added `createKarmaTransaction()` call when karma is awarded
- Updated logging to use `qualifiesForKarma` variable

## Behavior Changes

### Before

- Karma was added when `lookingForTeam: true` (regardless of registration status)
- Karma was always subtracted when a `lookingForTeam` player left (even if they never received karma)
- No historical record of karma transactions

### After

- Karma is added only when player is `lookingForTeam` AND fully registered (paid + signed)
- Karma is only subtracted if there's a matching transaction showing it was previously awarded
- All karma changes are logged in a `karma_transactions` subcollection
- Transaction records include player, team, amount, reason, timestamp, and season references

## Edge Cases Handled

1. **Player joins unregistered, then registers** - No karma awarded initially, no karma to subtract if they leave
2. **Player leaves before fully registering** - No karma subtracted (no matching transaction)
3. **Player joins with lookingForTeam but not paid/signed** - No karma awarded
4. **Multiple season changes** - Each transaction is scoped to a specific season
5. **Manual admin roster changes** - Not currently tracked (admin function doesn't use transactions)

## Future Considerations

### Admin Player Updates

The `updatePlayerAdmin` function directly manipulates team rosters without using Firestore transactions. Adding karma transaction support here would require:

- Refactoring to use Firestore transactions
- Checking player registration status when adding to teams
- Creating/reversing karma transactions appropriately

For now, this is deferred as offers are the primary way players join teams.

### Transaction Queries

Common queries you might want to run:

```typescript
// Get all karma transactions for a team in a season
const transactions = await teamRef
	.collection('karma_transactions')
	.where('season', '==', seasonRef)
	.orderBy('timestamp', 'desc')
	.get()

// Calculate total karma from transactions (for auditing)
let totalKarma = 0
transactions.forEach((doc) => {
	const data = doc.data()
	totalKarma += data.amount
})

// Find transactions for a specific player
const playerTransactions = await teamRef
	.collection('karma_transactions')
	.where('player', '==', playerRef)
	.where('season', '==', seasonRef)
	.get()
```

## Testing Checklist

- [ ] Player with lookingForTeam=true, paid=true, signed=true joins team → receives karma + transaction
- [ ] Player with lookingForTeam=true, paid=false joins team → no karma, no transaction
- [ ] Player with lookingForTeam=true, signed=false joins team → no karma, no transaction
- [ ] Player with lookingForTeam=false joins team → no karma, no transaction
- [ ] Player who received karma leaves team → karma subtracted + reversal transaction created
- [ ] Player who didn't receive karma leaves team → no karma subtracted, no transaction
- [ ] Multiple players join/leave in same season → transactions correctly logged
- [ ] Karma never goes below 0 when subtracted

## Migration Notes

### For Existing Data

Since this system only tracks NEW transactions going forward, you'll need to manually create historical transaction records for existing karma if you want a complete audit trail.

Sample script to create historical transactions:

```typescript
// For each team with karma > 0
// For each player on roster with lookingForTeam=true
// Create a transaction record with appropriate timestamp
```

This is optional - the system will work correctly for all new joins/leaves without historical data.
