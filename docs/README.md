# Documentation Index

This directory contains comprehensive documentation for the Minneapolis Winter League application.

## Getting Started

- [Development Setup Guide](./DEVELOPMENT_SETUP.md) - Complete setup instructions for local development
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Configuration and environment variable reference

## Architecture & Design

- [Project Structure](./PROJECT_STRUCTURE.md) - Codebase organization and file structure
- [Authentication System](./AUTHENTICATION_SYSTEM.md) - Auth system architecture and components
- [Bundle Optimization](./BUNDLE_OPTIMIZATION.md) - Performance optimization strategies

## Development Guides

- [TypeScript Improvements](./TYPESCRIPT_IMPROVEMENTS.md) - Type safety enhancements and patterns
- [Zod Validation Analysis](./ZOD_VALIDATION_ANALYSIS.md) - Data validation patterns and usage
- [Zod Advanced Usage Examples](./ZOD_ADVANCED_USAGE_EXAMPLES.md) - Advanced validation techniques

## Operations

- [Security Guidelines](./SECURITY.md) - Security practices and Firebase rules

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                    # Start emulators with test data
cd App && npm run dev:emulators # Start React app with emulators

# Build
cd App && npm run build        # Production build
cd App && npm run build:staging # Staging build

# Emulator Management
npm run dev:clean             # Start clean emulators
npm run emulators:export      # Save emulator data
npm run emulators:clear       # Clear all data
```

### Key Technologies

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Firebase (Auth, Firestore, Functions, Storage)
- **UI**: shadcn/ui + Tailwind CSS
- **Validation**: Zod schemas
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
| Project Structure       | Current      | ✅ Current |
| Bundle Optimization     | Current      | ✅ Current |
| TypeScript Improvements | Current      | ✅ Current |
| Security Guidelines     | Current      | ✅ Current |
| Zod Documentation       | Current      | ✅ Current |
