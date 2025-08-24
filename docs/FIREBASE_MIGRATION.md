# Firebase Firestore Restructuring Migration Guide

This guide helps you migrate from the old monolithic `firestore.ts` structure to the new organized domain-based structure.

## Summary of Changes

The original 949-line `firestore.ts` file has been reorganized into focused, domain-specific files:

- **Player operations** → `collections/players.ts`
- **Team operations** → `collections/teams.ts`
- **Offer operations** → `collections/offers.ts`
- **Game operations** → `collections/games.ts`
- **Season operations** → `collections/seasons.ts`
- **Payment operations** → `collections/payments.ts`

## Migration Strategy

### Phase 1: Backward Compatibility (Current)

✅ **No immediate action required**

The original `firestore.ts` file now re-exports all functions from the new structure, so existing imports continue to work:

```typescript
// This still works unchanged
import { createPlayer, createTeam, acceptOffer } from '@/firebase/firestore'
```

### Phase 2: Gradual Migration (Recommended)

For new code and when making changes to existing files, use the new import structure:

#### Option A: Import from specific domains (Recommended)

```typescript
// Old way
import { createPlayer, getPlayerRef } from '@/firebase/firestore'
import { createTeam, deleteTeam } from '@/firebase/firestore'

// New way - more explicit and clearer
import { createPlayer, getPlayerRef } from '@/firebase/collections/players'
import { createTeam, deleteTeam } from '@/firebase/collections/teams'
```

#### Option B: Import from main index

```typescript
// Old way
import { createPlayer, createTeam, acceptOffer } from '@/firebase/firestore'

// New way - single entry point
import { createPlayer, createTeam, acceptOffer } from '@/firebase'
```

### Phase 3: Complete Migration (Future)

Eventually, we can:

1. Update all imports to use the new structure
2. Remove the deprecated `firestore.ts` file
3. Update documentation and examples

## Migration Examples

### Player Operations

```typescript
// Before
import {
	createPlayer,
	getPlayerRef,
	updatePlayer,
	promoteToCaptain,
	demoteFromCaptain,
	removeFromTeam,
} from '@/firebase/firestore'

// After
import {
	createPlayer,
	getPlayerRef,
	updatePlayer,
	promoteToCaptain,
	demoteFromCaptain,
	removeFromTeam,
} from '@/firebase/collections/players'
```

### Team Operations

```typescript
// Before
import {
	createTeam,
	editTeam,
	deleteTeam,
	getTeamById,
	teamsQuery,
} from '@/firebase/firestore'

// After
import {
	createTeam,
	editTeam,
	deleteTeam,
	getTeamById,
	teamsQuery,
} from '@/firebase/collections/teams'
```

### Mixed Operations

```typescript
// Before
import {
	createPlayer,
	createTeam,
	acceptOffer,
	currentSeasonGamesQuery,
	seasonsQuery,
} from '@/firebase/firestore'

// After - Option A: Domain-specific imports
import { createPlayer } from '@/firebase/collections/players'
import { createTeam } from '@/firebase/collections/teams'
import { acceptOffer } from '@/firebase/collections/offers'
import { currentSeasonGamesQuery } from '@/firebase/collections/games'
import { seasonsQuery } from '@/firebase/collections/seasons'

// After - Option B: Main index import
import {
	createPlayer,
	createTeam,
	acceptOffer,
	currentSeasonGamesQuery,
	seasonsQuery,
} from '@/firebase'
```

### Type Imports

```typescript
// Before
import { DocumentData, DocumentReference } from '@/firebase/firestore'

// After - Option A: From types file
import { DocumentData, DocumentReference } from '@/firebase/types'

// After - Option B: From main index
import { DocumentData, DocumentReference } from '@/firebase'
```

## Benefits of Migration

1. **Clearer Intent**: Import statements show exactly which domain you're working with
2. **Better Tree Shaking**: Only import the functions you actually use
3. **Easier Testing**: Test individual domains in isolation
4. **Reduced Cognitive Load**: Smaller, focused files are easier to understand
5. **Better Collaboration**: Multiple developers can work on different domains

## Files to Consider for Migration

Based on current usage, these files have imports that could be migrated:

- `App/src/providers/seasons-context.tsx`
- `App/src/providers/offers-context.tsx`
- `App/src/features/manage/*` (multiple files)
- `App/src/features/teams/*` (multiple files)
- `App/src/shared/hooks/*` (multiple files)

## Best Practices

1. **New Files**: Always use the new import structure
2. **Existing Files**: Migrate imports when making other changes to the file
3. **Consistency**: Within a single file, prefer using one import style (domain-specific or main index)
4. **Documentation**: Update import examples in documentation as you encounter them

## Rollback Plan

If any issues arise, you can easily revert by:

1. The original `firestore.ts` continues to work as before
2. All existing imports remain functional
3. No breaking changes have been introduced

## Timeline

- **Phase 1**: ✅ Complete - Backward compatibility maintained
- **Phase 2**: Ongoing - Gradual migration as files are modified
- **Phase 3**: TBD - Complete migration and cleanup
