# @minneapolis-winter-league/shared

Shared TypeScript types and utilities for the Minneapolis Winter League application.

## Overview

This package contains common type definitions, validation utilities, and constants used across both the frontend (App) and backend (Functions) of the Minneapolis Winter League project.

## Features

- **Type Safety**: Strongly typed interfaces for all data structures
- **Validation**: Type guards and validation utilities
- **Constants**: Shared enums and constant values
- **Firebase Integration**: Types compatible with Firebase Firestore

## Usage

### Importing Types

```typescript
import {
	PlayerData,
	TeamData,
	SeasonData,
} from '@minneapolis-winter-league/shared'
```

### Using Type Guards

```typescript
import { isPlayerData } from '@minneapolis-winter-league/shared'

if (isPlayerData(someData)) {
	// TypeScript knows someData is PlayerData
	console.log(someData.firstname)
}
```

### Using Constants

```typescript
import { Collections } from '@minneapolis-winter-league/shared'

const playersCollection = firestore.collection(Collections.PLAYERS)
```

## Development

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Type Definitions

### Core Types

- `PlayerData` - User/player information
- `TeamData` - Team information and roster
- `SeasonData` - Season configuration and teams
- `OfferData` - Player invitations and requests
- `GameData` - Game scheduling and scores
- `WaiverData` - Legal waiver information

### Enums

- `Collections` - Firebase collection names
- `OfferStatus` - Offer state management
- `OfferCreator` - Who created an offer
- `OfferType` - Different types of offers

## Integration

This package is automatically built and linked in both the App and Functions packages through npm workspaces. Changes to types are immediately available in both frontend and backend code.

## Contributing

When adding new types:

1. Add the interface to `src/types.ts`
2. Add corresponding validation functions to `src/validation.ts`
3. Export new types from `src/index.ts`
4. Update this README if needed
5. Run `npm run build` to compile changes
