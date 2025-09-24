# Setup and Development Documentation

This directory contains documentation for project setup, development environment, and deployment procedures.

## 📚 Documents

### Development Setup

- **[Development Setup](./DEVELOPMENT_SETUP.md)** - Complete development environment setup guide
- **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** - Configuration and secrets management

### Migration Guides

- **[Functions Migration Status](./FIREBASE_FUNCTIONS_MIGRATION_STATUS.md)** - Firebase Functions migration progress
- **[Documentation Migration Summary](./DOCUMENTATION_MIGRATION_SUMMARY.md)** - Documentation reorganization summary

### Optimization

- **[Bundle Optimization](./BUNDLE_OPTIMIZATION.md)** - Frontend performance and bundle analysis

## 🚀 Quick Start

### Prerequisites

```bash
# Required tools
node >= 18.0.0
npm >= 9.0.0
firebase-tools >= 12.0.0
git
```

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/Minneapolis-Winter-League.git
cd Minneapolis-Winter-League

# Install dependencies for all packages
npm install                    # Root dependencies
cd App && npm install         # React app
cd ../Functions && npm install # Firebase Functions
```

### Development Environment

```bash
# Start Firebase Emulators
firebase emulators:start

# In a new terminal, start the React development server
cd App
npm run dev
```

## 🏗️ Project Architecture

### Monorepo Structure

```
Minneapolis-Winter-League/
├── App/                    # React frontend application
├── Functions/              # Firebase Cloud Functions
├── docs/                   # Documentation (this directory)
├── .emulator/              # Firebase emulator test data
└── *.json                  # Firebase and project configuration
```

## 🔧 Development Workflow

### Daily Development

1. **Start Emulators**: `firebase emulators:start`
2. **Start App**: `cd App && npm run dev`
3. **Code Changes**: Edit in any package
4. **Test Locally**: Emulator suite provides full backend
5. **Commit Changes**: Standard Git workflow

### Package Development

```bash
# Functions development
cd Functions
npm run build             # Compile TypeScript
npm run lint              # ESLint checks
npm run deploy            # Deploy to Firebase (if needed)

# App development
cd App
npm run dev               # Development server
npm run build             # Production build
npm run preview           # Preview production build
```

## 🧪 Testing Strategy

### Testing Levels

- **Unit Tests**: Individual function and component testing
- **Integration Tests**: Firebase Functions with emulator
- **E2E Tests**: Full application workflow testing
- **Type Tests**: TypeScript compilation verification

### Testing Commands

```bash
# Run all tests
npm test                  # Root level test script

# Package-specific testing
cd Functions && npm test  # Functions unit tests
cd App && npm test       # React component tests
cd Shared && npm test    # Validation schema tests
```

## 🚀 Deployment Process

### Environment Stages

1. **Development**: Local with Firebase Emulators
2. **Staging**: Firebase project preview
3. **Production**: Live Firebase project

### Deployment Commands

```bash
# Deploy all services to production
firebase deploy

# Deploy specific services
firebase deploy --only functions    # Just Cloud Functions
firebase deploy --only hosting     # Just React app
firebase deploy --only firestore   # Just Firestore rules
```

### Pre-deployment Checklist

- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] Environment variables configured
- [ ] Firebase project selected correctly

## 🔐 Environment Configuration

### Environment Variables

```bash
# App/.env.local
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
# ... additional Firebase config

# Functions/.env
STRIPE_SECRET_KEY=sk_test_...
FIREBASE_PROJECT_ID=your-project-id
# ... additional function config
```

### Configuration Management

- **Development**: `.env.local` files (not committed)
- **Production**: Firebase Functions config
- **Shared**: Firebase project configuration
- **Secrets**: Firebase Functions secret manager

## 📊 Performance Monitoring

### Frontend Performance

- **Bundle Analysis**: `npm run build` in App/
- **Lighthouse**: Automated performance testing
- **Vite Build**: Optimized production builds

### Backend Performance

- **Functions Monitoring**: Firebase Console
- **Firestore Performance**: Query optimization
- **Emulator Insights**: Local performance testing

## 🔮 Future Development

### Planned Improvements

- **CI/CD Pipeline**: Automated testing and deployment
- **Docker Support**: Containerized development environment
- **Advanced Testing**: E2E test automation
- **Performance Monitoring**: Real-time performance tracking
- **Documentation**: Automated API documentation generation

### Contributing Guidelines

1. **Fork Repository**: Create personal fork
2. **Feature Branch**: Create feature-specific branch
3. **Development**: Use emulator suite for testing
4. **Testing**: Ensure all tests pass
5. **Pull Request**: Submit for code review
6. **Deployment**: Merge triggers deployment pipeline
