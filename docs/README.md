# Documentation Index

This directory contains comprehensive documentation for the Minneapolis Winter League application, organized by component and functionality.

## � Documentation Structure

### 🖥️ [App Documentation](./app/)

Frontend React application documentation, including components, features, and user interface.

### ⚡ [Functions Documentation](./functions/)

Firebase Cloud Functions documentation, including API references, triggers, and backend logic.

### 📦 [Shared Package Documentation](./shared/)

Shared TypeScript types and validation schemas used across all packages.

### 🔥 [Firebase Infrastructure](./firebase/)

Firebase services configuration, security rules, and database documentation.

### 🚀 [Setup & Development](./setup/)

Development environment setup, deployment guides, and workflow documentation.

## 🏗️ Project Architecture

The Minneapolis Winter League is built as a modular TypeScript monorepo:

```
Minneapolis-Winter-League/
├── App/                    # React frontend (Vite + TypeScript)
├── Functions/              # Firebase Cloud Functions
├── Shared/                # Shared types and validation
├── docs/                  # This documentation
└── .emulator/         # Firebase emulator test data
```

## 🚀 Quick Start

1. **[Development Setup](./setup/DEVELOPMENT_SETUP.md)** - Get your environment ready
2. **[Project Structure](./PROJECT_STRUCTURE.md)** - Understand the codebase organization
3. **[Authentication System](./firebase/AUTHENTICATION_SYSTEM.md)** - Learn the auth flow
4. **[App Components](./app/)** - Explore the frontend architecture
5. **[Functions API](./functions/)** - Understand the backend logic

## 🔒 Security Architecture

The application uses a **functions-first security model**:

- **Client**: Read-only access with minimal permissions
- **Functions**: All writes and sensitive operations
- **Validation**: Server-side validation with Zod schemas
- **Authentication**: Firebase Auth with custom claims

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
