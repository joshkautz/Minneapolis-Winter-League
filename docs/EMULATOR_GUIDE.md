# Firebase Emulator Development Guide

## Quick Start (Recommended)

### Start with Test Data

```bash
npm run dev
```

This will:

- Build your React app for production
- Start Firebase emulators with test data imported
- Serve your app through Firebase Hosting emulator
- Export any changes when you stop the emulators

### Start Clean (No Test Data)

```bash
npm run dev:clean
```

### Start Backend Only (No Hosting)

```bash
npm run dev:backend
```

## Access Points

- **Your React App**: http://localhost:5005 (Firebase Hosting Emulator)
- **Emulator UI**: http://localhost:4000
- **Firestore Data**: http://localhost:4000/firestore
- **Authentication**: http://localhost:4000/auth
- **Storage**: http://localhost:4000/storage

## Test Data

### Authentication Users

- captain1@test.com, captain2@test.com, captain3@test.com
- player1@test.com, player2@test.com, player3@test.com, player4@test.com
- All users are email verified
- Password: `testpass123`

### Firestore Collections

- **seasons**: One test season (2024 Test Season)
- **teams**: Three teams (Alpha, Beta, Gamma)
- **players**: Seven players with mixed assignments
- **games**: Three sample games (mix of completed/upcoming)

## Available Commands

```bash
# Start with test data + hosting (recommended for development)
npm run dev

# Start clean + hosting (no existing data)
npm run dev:clean

# Start backend only (no hosting emulator)
npm run dev:backend

# Build the React app
npm run build:app

# Export current emulator data (save changes)
npm run emulators:export

# Clear all saved data
npm run emulators:clear
```

## Development Workflow

### Daily Development

1. Run `npm run dev` to start with test data
2. Develop and test your app
3. Stop emulators (Ctrl+C) - changes are automatically saved

### Modifying Test Data

1. Start emulators: `npm run dev`
2. Open Emulator UI: http://localhost:4000
3. Make changes through the UI
4. Stop emulators - changes are automatically exported
5. Commit the updated `emulator-data/` to version control

### Starting Fresh

1. Run `npm run emulators:clear` to delete all test data
2. Run `npm run dev:clean` to start with empty emulators
3. Create new test data through the UI
4. Stop emulators to export the new data

## Benefits of This Approach

- **Fast startup**: No need to run seeding scripts
- **Consistent data**: Everyone gets identical test data
- **Persistent changes**: Your modifications are preserved
- **Team collaboration**: Data changes can be version controlled

### Java Version Warnings

If you see warnings about `sun.misc.Unsafe`, you're using Java 24+ which has compatibility issues. Fix by switching to Java 17:

```bash
# Install Java 17
brew install openjdk@17

# Update your PATH (add to ~/.zshrc)
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"

# Verify the version
java -version  # Should show "17.0.x"
```

### Emulators Won't Start

- Check if ports 4000, 8080, 9099, 9199 are free
- Make sure Java 17 is installed (`java -version`)
- Try `firebase login` if authentication issues

### Seeding Fails

- Ensure emulators are running first
- Check emulator UI is accessible at http://localhost:4000
- Look for error messages in terminal output

### Data Not Appearing

- Refresh the Emulator UI in browser
- Check Firestore tab in Emulator UI
- Verify seed script completed successfully

The automatic setup (`npm run dev:setup`) handles most issues automatically!
