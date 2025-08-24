# Migration Guide: Using Shared Types

This guide explains how to migrate existing code to use the new shared types package.

## Overview

The shared types package (`@minneapolis-winter-league/shared`) provides:

- Consistent type definitions across frontend and backend
- Type guards and validation utilities
- Common constants and enums

## Installation

The shared package is already configured in both App and Functions `package.json`:

```json
{
	"dependencies": {
		"@minneapolis-winter-league/shared": "file:../Shared"
	}
}
```

## Migration Steps

### 1. Update Imports in Functions

**Before:**

```typescript
// Functions/src/index.ts
interface PlayerData extends DocumentData {
	admin: boolean
	email: string
	// ...
}

interface TeamData extends DocumentData {
	logo: string
	name: string
	// ...
}
```

**After:**

```typescript
// Functions/src/index.ts
import {
	PlayerData,
	TeamData,
	COLLECTIONS,
	FIELDS,
} from '@minneapolis-winter-league/shared'
```

### 2. Update Imports in App

**Before:**

```typescript
// App/src/shared/utils/interfaces.ts
export interface PlayerData extends DocumentData {
	admin: boolean
	email: string
	// ...
}
```

**After:**

```typescript
// App/src/components/SomeComponent.tsx
import {
	PlayerData,
	TeamData,
	isPlayerData,
} from '@minneapolis-winter-league/shared'
```

### 3. Replace Constants

**Before:**

```typescript
const COLLECTIONS = {
	SEASONS: 'seasons',
	PLAYERS: 'players',
	// ...
}
```

**After:**

```typescript
import { COLLECTIONS, FIELDS } from '@minneapolis-winter-league/shared'
```

### 4. Use Type Guards

**Before:**

```typescript
// Manual type checking
if (data && typeof data.admin === 'boolean') {
	// Use data as PlayerData
}
```

**After:**

```typescript
import { isPlayerData } from '@minneapolis-winter-league/shared'

if (isPlayerData(data)) {
	// TypeScript knows data is PlayerData
	console.log(data.firstname) // Type-safe!
}
```

## Key Files to Update

### Functions/src/index.ts

- Remove local interface definitions
- Import types from `@minneapolis-winter-league/shared`
- Update COLLECTIONS and FIELDS usage

### App/src/shared/utils/interfaces.ts

- Remove duplicate type definitions
- Re-export from `@minneapolis-winter-league/shared` if needed for backward compatibility

### App/src/firebase/firestore.ts

- Update type imports
- Use shared constants

## Example Migration

**Before (Functions/src/index.ts):**

```typescript
interface PlayerData extends DocumentData {
	admin: boolean
	email: string
	firstname: string
	lastname: string
	seasons: {
		captain: boolean
		paid: boolean
		season: DocumentReference<SeasonData, DocumentData>
		signed: boolean
		team: DocumentReference<TeamData, DocumentData> | null
	}[]
}

const COLLECTIONS = {
	SEASONS: 'seasons',
	PLAYERS: 'players',
}
```

**After (Functions/src/index.ts):**

```typescript
import {
	PlayerData,
	TeamData,
	SeasonData,
	COLLECTIONS,
	FIELDS,
} from '@minneapolis-winter-league/shared'
```

## Benefits After Migration

1. **Type Safety**: Compile-time type checking across frontend and backend
2. **Consistency**: Single source of truth for data structures
3. **IntelliSense**: Better IDE support with autocomplete
4. **Maintainability**: Changes in one place update everywhere
5. **Documentation**: Types serve as living documentation

## Testing Migration

After updating imports:

1. Build the shared package: `npm run build:shared`
2. Build Functions: `npm run build:functions`
3. Build App: `npm run build:app`
4. Run type checking: `npm run lint`

All builds should complete without TypeScript errors.

## Gradual Migration

You can migrate gradually:

1. Start with new code using shared types
2. Update existing files one at a time
3. Keep backward compatibility during transition
4. Remove old type definitions once migration is complete

## Next Steps

1. Update existing files to use shared types
2. Add more validation utilities to shared package as needed
3. Consider adding Zod schemas for runtime validation
4. Expand shared package with common utilities
