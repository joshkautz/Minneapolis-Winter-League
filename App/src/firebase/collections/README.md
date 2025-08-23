# Firebase Collections

This directory contains organized Firestore operations split by domain/entity type. This structure improves maintainability, testability, and makes it easier to understand the relationships between different parts of the application.

## Structure

### `/collections/`

Contains domain-specific Firestore operations:

#### `players.ts`

Player-related operations:

- `createPlayer` - Creates a new player document for registered users
- `getPlayerSnapshot` - Gets a player document snapshot by reference
- `getPlayerRef` - Gets a player document reference from authenticated user
- `getPlayersQuery` - Creates a query to search for players by name
- `updatePlayer` - Updates a player document with new data
- `promoteToCaptain` - Promotes a player to captain status
- `demoteFromCaptain` - Demotes a player from captain status
- `removeFromTeam` - Removes a player from a team

#### `teams.ts`

Team-related operations:

- `createTeam` - Creates a new team and assigns a captain
- `rolloverTeam` - Creates a new team with existing team ID (for rollovers)
- `editTeam` - Edits team information (name, logo, storage path)
- `deleteTeam` - Deletes a team and cleans up all related data
- `getTeamById` - Gets a team document reference by ID
- `teamsQuery` - Creates a query for multiple teams by their references
- `teamsHistoryQuery` - Creates a query for teams with the same team ID
- `currentSeasonTeamsQuery` - Creates a query for all teams in a specific season
- `teamsBySeasonQuery` - Creates a query for teams by season reference

#### `offers.ts`

Offer-related operations (invitations and requests):

- `acceptOffer` - Accepts an offer (invitation or request)
- `rejectOffer` - Rejects an offer (invitation or request)
- `invitePlayer` - Creates an invitation for a player to join a team
- `requestToJoinTeam` - Creates a request for a player to join a team
- `outgoingOffersQuery` - Creates a query for outgoing offers
- `incomingOffersQuery` - Creates a query for incoming offers
- `offersForPlayerByTeamQuery` - Creates a query for offers between specific player and team

#### `games.ts`

Game-related operations:

- `currentSeasonRegularGamesQuery` - Creates a query for regular season games
- `currentSeasonPlayoffGamesQuery` - Creates a query for playoff games
- `currentSeasonGamesQuery` - Creates a query for all games in a season
- `gamesByTeamQuery` - Creates a query for all games involving a specific team

#### `seasons.ts`

Season-related operations:

- `seasonsQuery` - Creates a query for all seasons

#### `payments.ts`

Payment-related operations (Stripe integration):

- `stripeRegistration` - Creates a Stripe checkout session for registration

### `types.ts`

Re-exported Firebase types for consistent usage across the application.

### `index.ts`

Main entry point that re-exports all functions from the collections for convenience and backward compatibility.

## Usage

### Recommended (New Structure)

```typescript
// Import specific domain functions
import { createPlayer, getPlayerRef } from '@/firebase/collections/players'
import { createTeam, deleteTeam } from '@/firebase/collections/teams'
import { acceptOffer, rejectOffer } from '@/firebase/collections/offers'

// Or import from main index
import { createPlayer, createTeam, acceptOffer } from '@/firebase'
```

### Legacy (Backward Compatibility)

```typescript
// Still works, but deprecated
import { createPlayer, createTeam, acceptOffer } from '@/firebase/firestore'
```

## Benefits

1. **Single Responsibility**: Each file has a clear, focused purpose
2. **Better Organization**: Easy to find functions related to specific entities
3. **Improved Testing**: Test individual domains in isolation
4. **Reduced Import Overhead**: Import only what you need
5. **Clearer Dependencies**: Obvious which functions depend on which data types
6. **Better Code Reviews**: Smaller, focused files are easier to review
7. **Enhanced Collaboration**: Multiple developers can work on different domains simultaneously

## Migration

The original `firestore.ts` file is kept for backward compatibility and will continue to work. However, new code should use the organized structure, and existing code should be gradually migrated.

## Auditing Notes

Functions marked with "Audited: [Date]" in comments have been reviewed and verified for correctness. When modifying these functions, please update the audit date.
