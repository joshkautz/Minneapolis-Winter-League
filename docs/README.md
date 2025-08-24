# Documentation Index

This directory contains comprehensive documentation for the Minneapolis Winter League application.

## 🚀 Getting Started

- [Development Setup Guide](./DEVELOPMENT_SETUP.md) - Complete setup instructions for local development
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Configuration and environment variable reference
- [Project Structure](./PROJECT_STRUCTURE.md) - Codebase organization and file structure

## 🏗️ Architecture & Security

- [Firebase Functions Migration Status](./FIREBASE_FUNCTIONS_MIGRATION_STATUS.md) - Complete migration status and security improvements
- [Security Migration Guide](./SECURITY_MIGRATION.md) - Migration from client-side to secure Functions architecture
- [Security Guidelines](./SECURITY.md) - Security practices and Firebase rules
- [Authentication System](./AUTHENTICATION_SYSTEM.md) - Auth system architecture and components

## 🔥 Firebase Integration

- [Firebase Migration Guide](./FIREBASE_MIGRATION.md) - General Firebase migration documentation
- [Firebase Collections Guide](./FIREBASE_COLLECTIONS_README.md) - Collection structure and usage
- [Firestore Indexes Documentation](./FIRESTORE_INDEXES.md) - Index configuration, performance, and optimization
- [Player Function Documentation](./PLAYER_FUNCTION_DOCUMENTATION.md) - Player management Functions API

## 📦 Shared Packages & Types

- [Shared Package Documentation](./SHARED_PACKAGE_README.md) - @minneapolis-winter-league/shared package usage and structure
- [Shared Types Migration](./SHARED_TYPES_MIGRATION.md) - TypeScript shared types implementation
- [TypeScript Improvements](./TYPESCRIPT_IMPROVEMENTS.md) - Type safety enhancements and patterns

## ✅ Validation & Data

- [Zod Validation Analysis](./ZOD_VALIDATION_ANALYSIS.md) - Data validation patterns and usage
- [Zod Advanced Usage Examples](./ZOD_ADVANCED_USAGE_EXAMPLES.md) - Advanced validation techniques

## ⚡ Performance & Optimization

- [Bundle Optimization](./BUNDLE_OPTIMIZATION.md) - Performance optimization strategies

## 🛠️ Development Tools

- [Emulator Data Documentation](./EMULATOR_DATA_README.md) - Firebase emulator test data management

## 📋 Quick Reference

### Architecture Status

| Component            | Status      | Security Level  |
| -------------------- | ----------- | --------------- |
| ✅ Player Management | Complete    | Functions-only  |
| ✅ Team Management   | Complete    | Functions-only  |
| ✅ Offer System      | Complete    | Functions-only  |
| ✅ Authentication    | Stable      | Firebase Auth   |
| ✅ Firestore Rules   | Locked Down | Deny all writes |
| 🟡 Payment System    | Secure      | User-scoped     |

### Common Commands

```bash
# Development Environment
npm run dev                    # Start emulators with test data
cd App && npm run dev:emulators # Start React app with emulators

# Production Builds
cd App && npm run build        # Production build
cd App && npm run build:staging # Staging build

# Emulator Management
npm run dev:clean             # Start clean emulators
npm run emulators:export      # Save emulator data
npm run emulators:clear       # Clear all data

# Functions Development
cd Functions && npm run build  # Build Functions
cd Functions && npm run deploy # Deploy Functions
```

### Key Technologies

- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Firebase Functions Gen 2 + Firestore + Auth + Storage + Hosting
- **Security**: Functions-first architecture with strict Firestore rules
- **Validation**: Zod schemas with shared types via @minneapolis-winter-league/shared
- **Payments**: Stripe integration with Firebase Extensions
- **Development**: Firebase Emulators + Hot Module Replacement

### Documentation Categories

| Category         | Purpose            | Key Documents                                             |
| ---------------- | ------------------ | --------------------------------------------------------- |
| **Setup**        | Getting started    | Development Setup, Environment Variables                  |
| **Architecture** | System design      | Firebase Migration, Security Migration, Project Structure |
| **Security**     | Security practices | Security Guidelines, Functions Migration Status           |
| **Firebase**     | Database & queries | Collections Guide, Firestore Indexes, Functions API       |
| **Development**  | Daily development  | TypeScript Improvements, Validation Patterns              |
| **Reference**    | API & tools        | Player Functions, Shared Package, Emulator Data           |

- **Development**: Firebase Emulators + Hot Reload

### Development URLs

- React App: <http://localhost:5173>
- Firebase Emulator UI: <http://localhost:4000>
- Firestore Emulator: <http://localhost:8080>
- Auth Emulator: <http://localhost:9099>

## Contributing to Documentation

When updating documentation:

1. Keep it simple and focused
2. Include working code examples
3. Update related documents when making changes
4. Use clear, descriptive headings
5. Link between related documents

## Document Status

| Document                | Last Updated | Status     |
| ----------------------- | ------------ | ---------- |
| Development Setup       | Current      | ✅ Updated |
| Environment Variables   | Current      | ✅ Updated |
| Authentication System   | Current      | ✅ Current |
| Firestore Indexes       | Aug 2025     | ✅ New     |
| Project Structure       | Current      | ✅ Current |
| Bundle Optimization     | Current      | ✅ Current |
| TypeScript Improvements | Current      | ✅ Current |
| Security Guidelines     | Current      | ✅ Current |
| Zod Documentation       | Current      | ✅ Current |
