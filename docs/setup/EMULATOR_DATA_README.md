# Firebase Emulator Data

This directory contains exported Firebase emulator data for development and testing.

## Overview

This data is automatically imported when starting the Firebase emulators and exported when stopping them. This approach follows Firebase best practices for local development.

## Files

- `auth_export/` - Authentication users and settings
- `firestore_export/` - Firestore database collections and documents
- `storage_export/` - Cloud Storage files and metadata
- `firebase-export-metadata.json` - Export metadata and version info

## Test Data Included

### Authentication Users

- **Captains**: captain1@test.com, captain2@test.com, captain3@test.com
- **Players**: player1@test.com, player2@test.com, player3@test.com, player4@test.com
- All users have password: `testpass123`

### Firestore Collections

#### Seasons

- **test-season-2024**: A complete test season with registration and play dates

#### Teams

- **Test Team Alpha**: Captained by Captain One
- **Test Team Beta**: Captained by Captain Two
- **Test Team Gamma**: Captained by Captain Three

#### Players

- Mix of captains and regular players
- Some assigned to teams, some unassigned
- Various payment and waiver statuses for testing

#### Games

- Sample games between teams
- Mix of completed and upcoming games
- Includes scores for completed games

## Usage

### Start Development with Test Data (Recommended)

```bash
npm run dev
```

This will:

- Start Firebase emulators with test data imported
- Automatically export any changes when you stop the emulators
- Preserve your data modifications between sessions

### Start Clean (No Test Data)

```bash
npm run dev:clean
```

### Export Current Data

If emulators are running and you want to save changes:

```bash
npm run emulators:export
```

### Clear All Data

```bash
npm run emulators:clear
```

## Modifying Test Data

1. Start emulators: `npm run dev`
2. Open Emulator UI: http://localhost:4000
3. Make changes to data through the UI
4. Stop emulators (Ctrl+C) - data is automatically exported
5. Commit changes to version control

## Benefits

- **Fast startup**: No need to run seeding scripts
- **Consistent data**: Everyone on the team gets identical test data
- **Persistent changes**: Modifications are preserved between sessions
- **Version controlled**: Test data changes can be tracked and shared
