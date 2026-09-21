# Potential Improvements

This document tracks potential improvements and enhancements that could be made to the codebase.

---

## Swiss-Style Season Implementation

### DRY Violations / Refactoring Opportunities

#### 1. Team Logo Component

The team logo rendering pattern is duplicated in 4+ places:
- `swiss-rankings.tsx` (admin rankings table and seeding list)
- `swiss-standings-table.tsx`
- `shared-standings-table.tsx`

**Recommendation**: Create a reusable `TeamLogo` component:

```typescript
// /App/src/shared/components/team-logo.tsx
interface TeamLogoProps {
  url?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const TeamLogo = ({ url, name, size = 'sm', className }: TeamLogoProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }

  if (url) {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        className={cn(
          sizeClasses[size],
          'rounded-full object-cover bg-muted border border-border',
          className
        )}
        loading='lazy'
      />
    )
  }

  return (
    <div
      className={cn(
        sizeClasses[size],
        'rounded-full bg-gradient-to-r from-primary to-sky-300 border border-border',
        className
      )}
      aria-label={`${name} default logo`}
      role='img'
    />
  )
}
```

#### 2. Point Differential Color Utility

The logic for coloring point differential is duplicated in:
- `swiss-standings-table.tsx` (`getColor` function)
- `shared-standings-table.tsx` (`getColor` function)
- `swiss-rankings.tsx` (inline with `cn()`)

**Recommendation**: Extract to a shared utility:

```typescript
// /App/src/shared/utils/standings-utils.ts
export const getPointDifferentialColor = (gamesPlayed: number, differential: number): string => {
  if (differential > gamesPlayed * 5) {
    return 'text-green-600'
  }
  if (differential < gamesPlayed * -5) {
    return 'text-destructive'
  }
  return ''
}
```

#### 3. Team Map Creation Pattern

The pattern for creating a team lookup Map from a query snapshot is duplicated in multiple components.

**Recommendation**: Create a shared hook or utility:

```typescript
// /App/src/shared/hooks/use-team-map.ts
export const useTeamMap = (
  teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
): Map<string, TeamDocument> => {
  return useMemo(() => {
    const map = new Map<string, TeamDocument>()
    teamsQuerySnapshot?.docs.forEach((doc) => {
      map.set(doc.id, doc.data())
    })
    return map
  }, [teamsQuerySnapshot])
}
```

---

### Missing Features (From Original Plan)

#### 1. Teams Without Games in Frontend Standings

**Current Behavior**: The frontend `useSwissStandings` hook only includes teams that have played at least one game. Teams with no games don't appear in standings.

**Expected Behavior**: Teams without games should appear in standings, using their initial seeding rank as a fallback.

**Implementation Notes**:
- The backend `calculateSwissRankings` function already accepts a `teamIds` parameter to initialize all teams
- The backend `getInitialSeedingRank` function exists but is unused
- The frontend hook needs to be updated to accept team IDs and initialize all teams with zero stats

**Files to Modify**:
- `/App/src/shared/hooks/use-swiss-standings.ts` - Accept teamIds parameter
- `/App/src/features/public/standings/standings.tsx` - Pass team IDs to hook

#### 2. Drag-and-Drop Seeding Interface

**Current Behavior**: Seeding is managed with up/down arrow buttons.

**Expected Behavior**: The plan mentioned "Drag-and-drop or numbered list to order teams".

**Implementation Notes**:
- Consider using `@dnd-kit/core` or `react-beautiful-dnd` for drag-and-drop
- Would provide a more intuitive UX for reordering 12 teams
- Current up/down buttons work but are tedious for large reorderings

#### 3. Visual Indicator of Current Round

**Current Behavior**: The matchup pattern table shows all rounds statically.

**Expected Behavior**: The plan mentioned "Visual indicator of which night we're on (based on games played)".

**Implementation Notes**:
- Calculate current round based on `gamesPlayed` count
- Highlight the current round row in the matchup pattern table
- Could also show "Completed" badges on past rounds

**Example Logic**:
```typescript
// Assuming 3 games per round (3 fields)
const currentRound = Math.floor(gamesPlayed / 3) + 1
const isRoundComplete = (round: number) => gamesPlayed >= round * 3
```

---

### Code Quality Improvements

#### 1. Remove Unused Export

The `getInitialSeedingRank` function in `/Functions/src/services/swissRankings/calculator.ts` is exported but never used. Either:
- Implement the "teams without games" feature that would use it
- Remove the function if not needed

#### 2. Type Consolidation

The `ProcessedSeason` interface in `season-management.tsx` was extended with `format` field but is local to that file. If other components need processed season data with format, consider:
- Moving to a shared types file
- Or creating a shared hook that returns processed seasons

---

### Future Enhancements

#### 1. Auto-Generate Swiss Matchups

Currently admins manually create games based on the matchup pattern reference. A future enhancement could:
- Add a "Generate Round X Matchups" button
- Automatically create game documents based on current Swiss rankings
- Pre-fill home/away teams according to the pattern

#### 2. Swiss Score in Public View

Currently the public Swiss standings shows the same columns as traditional standings (W, L, +/-). Consider:
- Adding a tooltip showing Swiss score breakdown on hover
- Or an expandable row showing Buchholz details
- Balance between simplicity for casual viewers and detail for interested parties

#### 3. Head-to-Head Tiebreaker

Current tiebreaker is point differential only. Swiss tournaments sometimes use:
- Head-to-head record between tied teams
- Sonneborn-Berger score (sum of defeated opponents' scores)
- Could be added as additional tiebreaker levels
