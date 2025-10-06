# ⚠️ ARCHIVED - Karma and Player Locking Feature

> **DEPRECATED**: This document describes an outdated implementation that included a "locked" field for players. The "locked" field has been removed from the system as it was redundant with the `lookingForTeam` field.
>
> For current karma system documentation, see:
>
> - [KARMA_TRANSACTION_SYSTEM.md](/docs/KARMA_TRANSACTION_SYSTEM.md)
> - [KARMA_IMPLEMENTATION_SUMMARY.md](/KARMA_IMPLEMENTATION_SUMMARY.md)
>
> This file is kept for historical reference only.

---

## Overview

This document describes the OLD implementation of two related features:

1. **Team Karma System**: Rewards teams for adding players who are looking for teams
2. **Player Locking System**: Locks rosters once 12 teams reach full registration (NO LONGER USED)

## Changes Made

### 1. Type Definitions

#### TeamDocument (`App/src/types.ts` and `Functions/src/types.ts`)

- Added `karma: number` field
  - Represents karma points earned by helping players find teams
  - Initialized to 0 when teams are created
  - Incremented by 100 when a `lookingForTeam` player joins
  - Decremented by 100 when a `lookingForTeam` player leaves (minimum 0)

#### PlayerSeason (`App/src/types.ts` and `Functions/src/types.ts`)

- Added `lookingForTeam: boolean` field
  - Indicates the player is searching for a team
  - Set to `true` when roster lock occurs and player is not on a registered team
  - **This status is permanent once set and never changes for the season**
- Added `locked: boolean` field
  - Indicates the player was on a registered team when roster lock occurred
  - Set to `true` when roster lock occurs and player is on a registered team
  - **For all intents and purposes, locked players are treated as `lookingForTeam: false`**
  - Locked players can leave teams as long as it doesn't break registration status
  - **This status is permanent once set and never changes for the season**

### 2. Firebase Functions

#### New Trigger: Team Registration Lock (`Functions/src/triggers/documents/teamRegistrationLock.ts`)

- Triggers when a team's registration status changes from `false` to `true`
- When the 12th team becomes registered:
  - Marks all players on the 12 registered teams as `locked: true`
  - Marks all other players with no team as `lookingForTeam: true`
  - Processes updates in batches of 500 for performance

#### Updated: Offer Acceptance Trigger (`Functions/src/triggers/documents/offerUpdated.ts`)

- When a player accepts an offer and joins a team:
  - Checks if the player has `lookingForTeam: true` AND `locked: false`
  - If yes, adds 100 karma to the team
  - Updates player's team reference
  - **Does NOT modify `lookingForTeam` or `locked` status** - these are permanent once set
  - Logs karma bonus in success message

#### Updated: Manage Player Function (`Functions/src/functions/teams/managePlayer.ts`)

- Enhanced `handleRemoveFromTeam` function:
  - **Registration Status Check**: Validates that removing a player won't break registration by:
    - Fetching all roster player documents within the transaction
    - Counting only players who are actually registered (both `paid: true` AND `signed: true`)
    - Ensuring at least 10 registered players remain after removal
  - **Karma Adjustment**: Subtracts 100 karma when a player with `lookingForTeam: true` AND `locked: false` is removed
  - Updates player's team reference to null
  - **Does NOT modify `lookingForTeam` or `locked` status** - these are permanent once set
  - All checks include user-friendly error messages

#### Updated: Create Team Function (`Functions/src/functions/teams/create.ts`)

- Initializes new teams with `karma: 0`
- Sets captain's `lookingForTeam: false` and `locked: false`

#### Updated: Add New Season Function (`Functions/src/functions/players/addNewSeason.ts`)

- Initializes new season entries with:
  - `lookingForTeam: false`
  - `locked: false`

#### Updated: Rollover Team Function (`Functions/src/functions/teams/rollover.ts`)

- Initializes rolled-over teams with `karma: 0`
- Sets captain's `lookingForTeam: false` and `locked: false`

### 3. React Application

#### Updated: Team Profile Page (`App/src/features/teams/team-profile/team-profile.tsx`)

- Displays team karma in the roster card footer
- Only shown when karma > 0
- Styled subtly with:
  - Small text size (`text-xs`)
  - Muted color (`text-muted-foreground`)
  - Primary color for the karma value
  - Positioned to the right of registration status

#### Updated: Team Card Component (`App/src/features/teams/team-card.tsx`)

- Displays team karma on team cards in the Teams page
- Only shown when karma > 0 and team is registered
- Positioned next to the "Registered" badge
- Same subtle styling as team profile page

#### Updated: Teams Page (`App/src/features/teams/teams.tsx`)

- Passes karma data from team documents to TeamCard components
- Ensures karma is included in the teamData prop

### 4. Index Export (`Functions/src/index.ts`)

- Added export for `onTeamRegistrationChange` trigger

## Feature Behavior

### Karma System

1. **Earning Karma**: Teams earn 100 karma points when they add a player who has `lookingForTeam: true` AND `locked: false`
2. **Losing Karma**: Teams lose 100 karma points when a player with `lookingForTeam: true` AND `locked: false` leaves (minimum 0)
3. **Display**: Karma is displayed subtly on the team profile page and teams listing, only when > 0
4. **Permanence**: A player's `lookingForTeam` and `locked` statuses are permanent once set
5. **Locked Player Treatment**: Locked players are treated as `lookingForTeam: false` for karma purposes - they never generate karma bonuses

### Player Locking System

1. **Trigger Condition**: When the 12th team reaches full registration (10+ registered players)
2. **Locked Players**: All players on the 12 registered teams are marked as `locked: true`
3. **Looking for Team**: All other players without teams are marked as `lookingForTeam: true`
4. **Permanence**: Once a player receives `locked` or `lookingForTeam` status, **it never changes for that season**
5. **Locked Player Behavior**: Locked players can leave teams as long as it doesn't break registration status (they're essentially treated as `lookingForTeam: false`)
6. **Restrictions**:
   - Any player cannot leave if it would cause team to lose registered status (minimum 10 fully registered players)
   - Clear error messages explain why actions are blocked

## Error Messages

### Leaving Would Break Registration

```
You cannot leave your team at this time. Your departure would cause the team to lose its registered status. The team needs at least 10 fully registered players (paid and signed waiver), but would only have X after your departure.
```

## Migration Considerations

For existing data:

1. Teams will need `karma: 0` added to their documents
2. Player seasons will need `lookingForTeam: false` and `locked: false` added
3. The `addNewSeasonToAllPlayers` admin function will handle new season initialization
4. Existing teams can be updated via a migration script if needed

## Future Enhancements

Potential improvements:

- Karma leaderboard showing which teams help the most
- Different karma values for different player skill levels
- Karma decay over time
- Karma-based perks or recognition
- Admin dashboard to view locked/unlocked players
- Manual override for admins to unlock specific players
