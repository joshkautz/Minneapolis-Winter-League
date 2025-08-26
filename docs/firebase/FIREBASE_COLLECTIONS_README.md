# Firebase Collections Guide

**⚠️ IMPORTANT: This directory structure is now DEPRECATED in favor of secure Firebase Functions.**

## Migration Status: ✅ Complete

All write operations have been migrated from client-side Firestore operations to secure Firebase Functions. This guide documents the old structure and shows the new Function-based approach.

## Old Structure (Pre-Migration)

### `/collections/` - **DEPRECATED**

Previously contained domain-specific Firestore operations that are now security vulnerabilities:

#### `players.ts` - **DEPRECATED** ❌

Old player operations (now handled by Functions):

- ~~`createPlayer`~~ → `createPlayerViaFunction`
- ~~`updatePlayer`~~ → `updatePlayerViaFunction`
- ~~`promoteToCaptain`~~ → `manageTeamPlayerViaFunction({ action: 'promote' })`
- ~~`demoteFromCaptain`~~ → `manageTeamPlayerViaFunction({ action: 'demote' })`
- ~~`removeFromTeam`~~ → `manageTeamPlayerViaFunction({ action: 'remove' })`

**Still valid** (read operations):

- `getPlayerSnapshot` - Gets a player document snapshot by reference
- `getPlayerRef` - Gets a player document reference from authenticated user
- `getPlayersQuery` - Creates a query to search for players by name

#### `teams.ts` - **DEPRECATED** ❌

Old team operations (now handled by Functions):

- ~~`createTeam`~~ → `createTeamViaFunction`
- ~~`editTeam`~~ → `editTeamViaFunction`
- ~~`deleteTeam`~~ → `deleteTeamViaFunction`

**Still valid** (read operations):

- `getTeamById` - Gets a team document reference by ID
- `teamsQuery` - Creates a query for multiple teams by their references
- `teamsHistoryQuery` - Creates a query for teams with the same team ID
- `currentSeasonTeamsQuery` - Creates a query for all teams in a specific season
- `teamsBySeasonQuery` - Creates a query for teams by season reference

#### `offers.ts` - **DEPRECATED** ❌

Old offer operations (now handled by Functions):

- ~~`acceptOffer`~~ → `updateOfferStatusViaFunction({ status: 'accepted' })`
- ~~`rejectOffer`~~ → `updateOfferStatusViaFunction({ status: 'rejected' })`
- ~~`invitePlayer`~~ → `createOfferViaFunction({ type: 'invitation' })`
- ~~`requestToJoinTeam`~~ → `createOfferViaFunction({ type: 'request' })`

**Still valid** (read operations):

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
