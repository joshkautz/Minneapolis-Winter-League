# Shared Package Documentation

This directory contains documentation for the shared TypeScript types and validation schemas in `/Shared/`.

## 📚 Documents

### Core Documentation
- **[Shared Package README](./SHARED_PACKAGE_README.md)** - Complete guide to @minneapolis-winter-league/shared package
- **[Shared Types Migration](./SHARED_TYPES_MIGRATION.md)** - Migration to centralized type definitions
- **[TypeScript Improvements](./TYPESCRIPT_IMPROVEMENTS.md)** - Type safety enhancements across all packages

### Validation
- **[Zod Validation Analysis](./ZOD_VALIDATION_ANALYSIS.md)** - Data validation patterns and usage
- **[Zod Advanced Usage Examples](./ZOD_ADVANCED_USAGE_EXAMPLES.md)** - Advanced validation techniques

## 🏗️ Package Architecture

The shared package provides centralized types and validation:

```
Shared/src/
├── index.ts           # Main exports
├── types.ts          # TypeScript interfaces and types
└── validation.ts     # Zod schemas and validators
```

## 📦 Package Usage

### Installation
The shared package is published as `@minneapolis-winter-league/shared` and consumed by:
- `/App/` - React application types and validation
- `/Functions/` - Firebase Functions types and validation

### Import Patterns
```typescript
// Types only
import type { PlayerDocument, TeamDocument } from '@minneapolis-winter-league/shared'

// Validation schemas
import { PlayerSchema, TeamSchema } from '@minneapolis-winter-league/shared'

// Constants
import { Collections, OfferStatus } from '@minneapolis-winter-league/shared'
```

## 🔧 Core Types

### Document Types
- **`PlayerDocument`** - Player profile data structure
- **`TeamDocument`** - Team information and roster
- **`SeasonDocument`** - Season configuration and timeline
- **`OfferDocument`** - Team invitations and requests
- **`WaiverDocument`** - Legal waiver tracking
- **`GameDocument`** - Game schedules and results

### Utility Types
- **`Collections`** - Firestore collection names
- **`OfferStatus`** - Offer state enumeration
- **`PlayerSeasonData`** - Player data per season

## ✅ Validation Schemas

All document types have corresponding Zod schemas for runtime validation:

```typescript
// Runtime validation
const validatedPlayer = PlayerSchema.parse(playerData)

// Type-safe parsing with error handling
const result = PlayerSchema.safeParse(playerData)
if (result.success) {
  // result.data is type-safe PlayerDocument
}
```

## 🔒 Type Safety Features

### Strict TypeScript
- Strict mode enabled across all packages
- No implicit any types
- Exhaustive type checking
- Branded types for IDs

### Validation Integration
- Runtime validation matches TypeScript types
- Automatic type inference from schemas
- Form validation integration
- API request/response validation

## 🚀 Development Workflow

### Making Changes
1. Update types in `Shared/src/types.ts`
2. Update validation in `Shared/src/validation.ts`
3. Build and publish: `npm run build && npm publish`
4. Update consuming packages: `npm update @minneapolis-winter-league/shared`

### Version Management
- Semantic versioning for breaking changes
- Automated builds and publishing
- Type compatibility testing

## 🔮 Future Enhancements

- Enhanced validation error messages
- Internationalization support
- Advanced schema composition
- Automated documentation generation
