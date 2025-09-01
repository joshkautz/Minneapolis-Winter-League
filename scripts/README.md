# Test Data Generation Scripts

This directory contains scripts and data files for generating comprehensive test data for the Firebase emulator.

## Quick Start

### Option 1: Use the automated script (Recommended)

1. Start the Firebase emulators:

   ```bash
   npm run dev:clean  # Start with clean slate
   ```

2. In another terminal, install script dependencies and run the seeder:

   ```bash
   cd scripts
   npm install
   node seed-test-data.js
   ```

3. Stop the emulators (Ctrl+C) to automatically export the data to `.emulator/`

### Option 2: Manual data import

1. Stop any running emulators
2. Copy the pre-generated data:
   ```bash
   cp -r scripts/test-data-export/* .emulator/
   ```
3. Start emulators: `npm run dev`

## What's Created

The test data includes:

### Authentication Users

- **Captains**: captain1@test.com through captain4@test.com
- **Players**: player1@test.com through player8@test.com
- **Admin**: admin@test.com
- All passwords: `testpass123`

### Firestore Data

#### Seasons

- **Winter 2024**: Completed season (Jan-Mar 2024)
- **Spring 2024**: In-progress season (Apr-Jun 2024)
- **Winter 2025**: Future season (Jan-Mar 2025)

#### Teams

- **Team Alpha**: 1st place Winter 2024 (Captain One + 2 players)
- **Team Beta**: 2nd place Winter 2024 (Captain Two + 2 players)
- **Team Gamma**: 3rd place Winter 2024 (Captain Three + 2 players)
- **Team Delta**: Spring 2024 team (Captain Four + 2 players)

#### Games

- Complete regular season and playoff games for Winter 2024
- Realistic scores and field assignments
- Mix of completed games with results

#### Players

- Realistic player assignments to teams and seasons
- Various payment and waiver statuses for testing
- Captain and regular player roles

#### Offers

- Pending team invitations
- Pending player requests
- Rejected offers for testing workflows

#### Waivers

- Sample signed waivers for various players

## Modifying Test Data

1. Edit the `seed-test-data.js` script
2. Run the script again to regenerate data
3. Stop emulators to export the new data

## Files

- `seed-test-data.js` - Main seeding script
- `package.json` - Dependencies for the script
- `README.md` - This file
