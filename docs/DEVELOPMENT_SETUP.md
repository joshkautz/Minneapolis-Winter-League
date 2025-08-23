# Firebase Development Environment Setup

This document describes how to use the Firebase development environment for the Minneapolis Winter League application.

## Quick Start

### 1. Start Firebase Emulators with Test Data

```bash
# From project root - starts emulators with existing test data
npm run dev
```

### 2. Run the App in Development Mode

```bash
# In a new terminal, navigate to App directory
cd App
npm run dev:emulators
```

### 3. Access Emulator UI

Visit `http://localhost:4000` to view and manage:

- Authentication users
- Firestore collections
- Storage files
- Function logs

## Available Commands

```bash
# Start with test data (recommended)
npm run dev

# Start clean (no test data)
npm run dev:clean

# Export current data (save changes)
npm run emulators:export

# Clear all data
npm run emulators:clear
```

## Environment Configuration

The application now supports multiple environments:

- **Production**: Uses live Firebase project (`minnesota-winter-league`)
- **Development**: Uses Firebase emulators with demo data
- **Staging**: Uses staging Firebase project (when created)

### Environment Variables

Environment-specific variables are defined in:

- `App/.env.development` - Development configuration
- `App/.env.production` - Production configuration
- `App/.env.staging` - Staging configuration

Key variables:

- `VITE_FIREBASE_ENV`: Determines which Firebase config to use
- `VITE_USE_EMULATORS`: Whether to connect to local emulators

## Firebase Services & Emulator Ports

When running emulators, the following services are available:

| Service        | Emulator Port | Production       |
| -------------- | ------------- | ---------------- |
| Authentication | 9099          | Firebase Auth    |
| Firestore      | 8080          | Cloud Firestore  |
| Functions      | 5001          | Cloud Functions  |
| Hosting        | 5000          | Firebase Hosting |
| Storage        | 9199          | Cloud Storage    |
| Emulator UI    | 4000          | N/A              |

## Development Workflow

### Starting Development

1. **Start emulators**: `firebase emulators:start`

   - This starts all Firebase services locally
   - Access Emulator UI at http://localhost:4000

2. **Run app**: `npm run dev:emulators` (in App directory)
   - App connects to local emulators
   - Hot reload enabled for development

### Seeding Test Data

```bash
# Start with fresh seed data
npm run emulators:start:seed

# Start clean emulators (no data)
npm run emulators:start

# Export current emulator data (save changes)
npm run emulators:export
```

The seed data includes:

- Test users with different roles (captains, players)
- Sample season data
- Test teams with assigned players
- Sample games (completed and upcoming)
- Various registration and payment statuses

### Switching Environments

To run against different environments:

```bash
# Development (emulators)
npm run dev:emulators

# Development (remote dev project - when created)
npm run dev

# Production preview (NOT recommended for development)
VITE_FIREBASE_ENV=production npm run dev
```

## Firebase Project Structure

### Current Projects

- `minnesota-winter-league` - Production
- `minnesota-winter-league-dev` - Development (to be created)
- `minnesota-winter-league-staging` - Staging (to be created)

### Creating Additional Projects

If you want to create actual development/staging Firebase projects:

1. Create projects in Firebase Console
2. Update `.firebaserc` with project IDs
3. Update environment config files with actual project credentials
4. Deploy security rules: `firebase deploy --only firestore:rules,storage`

## Security Rules

During development, emulators use the same security rules as production:

- `firestore.rules` - Firestore security rules
- `storage.rules` - Cloud Storage security rules

## Testing

### Unit Tests

```bash
cd App
npm test
```

### Integration Testing

Use the seeded development data to test:

- User authentication flows
- Team management
- Player registration
- Game scheduling

## Common Development Tasks

### Reset Emulator Data

Stop emulators and restart to clear all data:

```bash
# Stop: Ctrl+C
firebase emulators:start
```

### View Emulator Data

Access the Emulator UI at http://localhost:4000 to:

- Browse Firestore collections
- View Authentication users
- Monitor function logs
- Inspect storage files

### Debug Firebase Connection

Check browser console for Firebase environment logs:

```
🔥 Firebase environment: development
🔥 Project ID: demo-minnesota-winter-league
🔥 Use emulators: true
🔥 Connected to Firebase emulators
```

## Troubleshooting

### Emulators Won't Start

- Check if ports are already in use
- Ensure Firebase CLI is installed: `firebase --version`
- Check you're logged in: `firebase login`

### App Won't Connect to Emulators

- Verify `VITE_USE_EMULATORS=true` in environment
- Check emulators are running on expected ports
- Ensure no ad blockers blocking localhost connections

### Authentication Issues

- Verify Auth emulator is running on port 9099
- Check that test users exist in Auth emulator
- Use Emulator UI to manage users

## Production Deployment

When ready to deploy:

```bash
# Build for production
npm run build

# Deploy to production
firebase deploy --project production

# Deploy to staging
firebase deploy --project staging
```

## Environment Files

Keep environment files secure:

- Development configs are safe to commit (emulator-only)
- Production configs should use environment variables in CI/CD
- Never commit real API keys or secrets
