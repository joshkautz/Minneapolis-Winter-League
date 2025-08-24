# Development Setup Guide

Complete setup instructions for developing the Minneapolis Winter League application locally.

## Prerequisites

### Required Software

- **Node.js 18+** ([Download](https://nodejs.org/))
- **npm** (comes with Node.js) or **yarn**
- **Git** ([Download](https://git-scm.com/))
- **Firebase CLI** (`npm install -g firebase-tools`)

### Recommended Tools

- **VS Code** with extensions:
  - TypeScript + JavaScript Language Features
  - Tailwind CSS IntelliSense
  - Firebase Explorer
  - ESLint
  - Prettier

## Quick Setup

### 1. Clone Repository

```bash
git clone https://github.com/joshkautz/Minneapolis-Winter-League.git
cd Minneapolis-Winter-League
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install App dependencies
cd App && npm install && cd ..

# Install Functions dependencies
cd Functions && npm install && cd ..

# Install Shared package dependencies
cd Shared && npm install && cd ..
```

### 3. Start Development Environment

```bash
# From project root - start Firebase emulators with test data
npm run dev
```

In a new terminal:

```bash
# Start React development server
cd App && npm run dev:emulators
```

### 4. Access Application

- **React App**: <http://localhost:5173>
- **Firebase Emulator UI**: <http://localhost:4000>
- **Firestore Emulator**: <http://localhost:8080>
- **Functions Emulator**: <http://localhost:5001>

## Project Structure

```
Minneapolis-Winter-League/
├── App/                    # React frontend (Vite + TypeScript)
├── Functions/              # Firebase Cloud Functions (Gen 2)
├── Shared/                 # Shared types & validation (@mwl/shared)
├── docs/                   # Documentation
├── emulator-data/          # Test data for emulators
└── firebase.json           # Firebase configuration
```

## Development Workflow

### Daily Development

1. **Start emulators** (preserves data between restarts):

   ```bash
   npm run dev
   ```

2. **Start React app** (with emulator configuration):

   ```bash
   cd App && npm run dev:emulators
   ```

3. **Make changes** to code
4. **Hot reload** automatically updates browser

### Clean Start

To start with fresh data:

```bash
npm run dev:clean
```

### Functions Development

```bash
# Build Functions
cd Functions && npm run build

# Deploy Functions to emulator
firebase emulators:start --only functions

# Test Functions
cd App && npm run dev:emulators
```

### TypeScript Compilation

```bash
# Check App types
cd App && npm run type-check

# Check Functions types
cd Functions && npm run build

# Check Shared package types
cd Shared && npm run build
```

## Environment Configuration

### Development Environment Variables

Create `.env.local` in the `App/` directory:

```env
# Firebase Configuration (for emulators)
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Emulator Configuration
VITE_USE_EMULATORS=true
VITE_FIREBASE_EMULATOR_HUB_HOST=localhost
VITE_FIREBASE_EMULATOR_HUB_PORT=4000
```

### Firebase Project Configuration

```bash
# Login to Firebase
firebase login

# Select project (if you have access)
firebase use --add

# Or continue with emulators only
firebase use demo-project
```

## Key Development Commands

### Root Directory Commands

```bash
npm run dev                 # Start emulators with test data
npm run dev:clean          # Start clean emulators
npm run emulators:export   # Export current emulator data
npm run emulators:clear    # Clear all emulator data
```

### App Directory Commands

```bash
cd App/

npm run dev                # Start Vite dev server (production config)
npm run dev:emulators      # Start with emulator configuration
npm run build             # Production build
npm run build:staging     # Staging build
npm run preview           # Preview production build
npm run type-check        # TypeScript type checking
npm run lint              # ESLint checking
```

### Functions Directory Commands

```bash
cd Functions/

npm run build             # Build TypeScript Functions
npm run serve             # Serve Functions in emulator
npm run deploy            # Deploy to Firebase (requires auth)
npm run logs              # View Function logs
```

### Shared Package Commands

```bash
cd Shared/

npm run build             # Build TypeScript package
npm run type-check        # Check types
```

## Testing

### Running Tests

```bash
# App tests
cd App && npm run test

# Functions tests (when available)
cd Functions && npm run test

# Integration tests
npm run test:integration
```

### Testing with Emulators

```bash
# Start emulators
npm run dev

# Run tests against emulators
cd App && npm run test:emulators
```

## Troubleshooting

### Common Issues

#### Port Conflicts

If ports are in use:

```bash
# Kill processes on specific ports
npx kill-port 5173 4000 8080 5001

# Or use different ports
firebase emulators:start --port=4001
```

#### Emulator Data Issues

```bash
# Clear all data and restart
npm run emulators:clear
npm run dev:clean
```

#### TypeScript Errors

```bash
# Clear TypeScript cache
cd App && rm -rf node_modules/.cache
npm install
```

#### Function Build Errors

```bash
# Rebuild Functions
cd Functions && rm -rf lib/ && npm run build
```

### Firebase CLI Issues

```bash
# Update Firebase CLI
npm install -g firebase-tools@latest

# Clear Firebase cache
firebase logout && firebase login
```

## IDE Configuration

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
	"typescript.preferences.importModuleSpecifier": "relative",
	"editor.codeActionsOnSave": {
		"source.organizeImports": true
	},
	"editor.formatOnSave": true,
	"files.associations": {
		"*.css": "tailwindcss"
	}
}
```

### VS Code Extensions

Recommended extensions:

```json
{
	"recommendations": [
		"bradlc.vscode-tailwindcss",
		"firebase.vscode-firebase-explorer",
		"ms-vscode.vscode-typescript-next",
		"esbenp.prettier-vscode",
		"dbaeumer.vscode-eslint"
	]
}
```

## Next Steps

1. **Explore the codebase**: Start with `App/src/features/`
2. **Review documentation**: Check other files in `docs/`
3. **Make a test change**: Try modifying a component
4. **Test Functions**: Call a Firebase Function from the UI
5. **Review Firebase console**: Understand the emulator UI

## Getting Help

- **Documentation**: Check other files in `docs/` directory
- **Firebase Docs**: <https://firebase.google.com/docs>
- **React Docs**: <https://react.dev>
- **TypeScript Docs**: <https://www.typescriptlang.org/docs>
- **Tailwind Docs**: <https://tailwindcss.com/docs>

## Security Notes

- **Never commit real Firebase config** to version control
- **Use emulators for development** - they're isolated and safe
- **Functions-first architecture** - all writes go through secure Functions
- **Authentication required** - most operations require logged-in users
