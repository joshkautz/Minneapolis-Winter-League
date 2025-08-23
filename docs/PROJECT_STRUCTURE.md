# Project Structure

This Firebase project follows modern best practices for full-stack TypeScript development with clear separation between frontend (React), backend (Cloud Functions), and shared type definitions.

## Overall Project Structure

```text
Minneapolis-Winter-League/
├── App/                    # React frontend application
├── Functions/              # Firebase Cloud Functions
├── Shared/                 # Shared TypeScript types and utilities
├── docs/                   # Project documentation
├── emulator-data/          # Firebase emulator data
├── firebase.json           # Firebase configuration
├── package.json            # Root workspace configuration
└── README.md              # Project overview
```

## Frontend Application Structure (App/)

```text
App/
├── src/
│   ├── components/ui/          # shadcn/ui components (Radix UI primitives)
│   ├── features/              # Feature-based organization
│   │   ├── auth/             # Authentication feature
│   │   ├── home/             # Home page components
│   │   ├── teams/            # Teams management
│   │   ├── profile/          # User profile
│   │   ├── schedule/         # Game schedule
│   │   ├── standings/        # League standings
│   │   ├── create/           # Team creation
│   │   ├── manage/           # Team management
│   │   └── index.ts          # Feature barrel exports
│   ├── shared/               # Shared/common modules
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions & interfaces
│   │   └── index.ts         # Shared barrel exports
│   ├── providers/           # Context providers & state management
│   ├── pages/              # Page-level components (error pages, etc.)
│   ├── routes/             # Route configuration & lazy loading
│   ├── firebase/           # Firebase configuration & services
│   ├── App.tsx             # Root application component
│   ├── main.tsx            # Application entry point
│   └── globals.css         # Global styles
├── public/                 # Static assets
├── package.json           # Frontend dependencies
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript configuration
```

## Backend Functions Structure (Functions/)

```text
Functions/
├── src/
│   ├── index.ts           # Main functions export file
│   └── initializeApp.ts   # Firebase Admin initialization
├── package.json           # Backend dependencies
├── tsconfig.json          # TypeScript configuration
└── eslint.config.js       # ESLint configuration
```

## Shared Types Package (Shared/)

```text
Shared/
├── src/
│   ├── types.ts           # Core type definitions
│   ├── validation.ts      # Type guards and validation utilities
│   └── index.ts           # Main exports
├── dist/                  # Compiled TypeScript output
├── package.json           # Shared package configuration
├── tsconfig.json          # TypeScript configuration
└── eslint.config.js       # ESLint configuration
```

## Architecture Principles

### 1. Monorepo Structure

- **Root workspace**: Manages all packages with npm workspaces
- **Shared types**: Common TypeScript definitions used by both frontend and backend
- **Independent builds**: Each package can be built and deployed independently
- **Consistent tooling**: Shared ESLint, Prettier, and TypeScript configurations

### 2. Type Safety Across Stack

- **Shared types package**: Ensures consistency between frontend and backend
- **Strict TypeScript**: All packages use strict TypeScript configuration
- **Runtime validation**: Type guards and validation utilities in shared package
- **Firebase type safety**: Strongly typed Firestore document interfaces

### 3. Feature-Based Organization (Frontend)

- Each feature has its own folder with all related components
- Features are self-contained and can be easily moved or removed
- Barrel exports (`index.ts`) provide clean import paths

### 4. Separation of Concerns

- **App/**: React frontend with features, components, and providers
- **Functions/**: Firebase Cloud Functions for server-side logic
- **Shared/**: Common TypeScript types and validation utilities
- **docs/**: Comprehensive project documentation

### 5. Firebase Best Practices

- **Security rules**: Firestore and Storage rules are properly configured
- **Emulator support**: Full emulator suite for local development
- **CI/CD pipelines**: Automated testing and deployment with GitHub Actions
- **Predeploy hooks**: Automatic building and validation before deployment

## Import Path Conventions

### Frontend (App/)

```typescript
// Feature imports
import { Home } from "@/features/home";
import { AuthModal } from "@/features/auth";

// Shared imports
import { Layout, ProtectedRoute } from "@/shared/components";
import { useDebounce } from "@/shared/hooks";
import { cn } from "@/shared/utils";

// Provider imports
import { AuthContextProvider } from "@/providers";

// UI component imports
import { Button } from "@/components/ui/button";

// Shared types (from shared package)
import { PlayerData, TeamData } from "@mwl/shared";
```

### Backend (Functions/)

```typescript
// Firebase Functions imports
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

// Shared types (from shared package)
import { PlayerData, TeamData, COLLECTIONS } from "@mwl/shared";
```

## Development Workflow

### 1. Local Development

```bash
# Start the development environment
npm run dev

# Start emulators only
npm run emulators:start

# Start app in development mode
npm run dev:app
```

### 2. Building

```bash
# Build all packages
npm run build

# Build specific packages
npm run build:shared
npm run build:app
npm run build:functions
```

### 3. Testing and Linting

```bash
# Format all packages
npm run format

# Lint all packages
npm run lint

# Run tests (App only)
npm run test
```

### 4. Deployment

```bash
# Deploy everything
npm run deploy

# Deploy specific services
npm run deploy:hosting
npm run deploy:functions
npm run deploy:firestore
```

## Shared Types Package Benefits

### 1. Type Consistency

- **Single source of truth**: All data structure definitions are centralized
- **No type drift**: Frontend and backend use identical type definitions
- **Compile-time safety**: TypeScript catches type mismatches across packages

### 2. Development Experience

- **Better IntelliSense**: IDE provides accurate autocomplete and type hints
- **Refactoring safety**: Type changes propagate across the entire codebase
- **Reduced bugs**: Compile-time validation prevents runtime type errors

### 3. Maintenance Benefits

- **Easier updates**: Change types in one place, update everywhere
- **Documentation**: Types serve as living documentation of data structures
- **Validation utilities**: Shared type guards and validation functions

### 4. Firebase Integration

- **Firestore typing**: Strongly typed document references and data structures
- **Function parameters**: Cloud Functions receive properly typed data
- **API consistency**: Frontend and backend APIs use the same data contracts

## File Organization Guidelines

### 1. Naming Conventions

- **PascalCase**: React components (`AuthModal.tsx`)
- **kebab-case**: File names (`auth-modal.tsx`)
- **camelCase**: Functions and variables
- **SCREAMING_SNAKE_CASE**: Constants and environment variables

### 2. Barrel Exports

Each feature and shared module should have an `index.ts` file that exports its public API:

```typescript
// features/auth/index.ts
export { AuthModal } from "./auth-modal";
export { LoginForm } from "./login-form";
export { useAuth } from "./hooks/use-auth";
```

### 3. Import Organization

```typescript
// External libraries
import React from "react";
import { collection, query } from "firebase/firestore";

// Internal imports (absolute paths)
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { PlayerData } from "@mwl/shared";

// Relative imports (only for same feature)
import { AuthForm } from "./auth-form";
```

This structure ensures a maintainable, scalable, and type-safe Firebase application that follows modern development best practices.

#### Utility Functions

```typescript
// Shared utilities in shared/utils/
export const formatDate = (date: Date) => {
  // Utility logic
};

// Types and interfaces
export interface UserData {
  // Interface definition
}
```

## Benefits of This Structure

1. **Scalability**: Easy to add new features without affecting existing code
2. **Maintainability**: Clear organization makes code easy to find and modify
3. **Reusability**: Shared components and utilities promote code reuse
4. **Team Collaboration**: Clear conventions help team members work together
5. **Bundle Optimization**: Feature-based lazy loading improves performance
6. **Testing**: Isolated features are easier to test

## Migration Notes

The project has been reorganized from a flat component structure to this feature-based architecture:

- Components moved from `src/components/` to appropriate feature folders
- Contexts moved to `src/providers/` and renamed for clarity
- Hooks consolidated in `src/shared/hooks/`
- Utilities consolidated in `src/shared/utils/`
- Path aliases updated for cleaner imports

## Development Guidelines

1. **New Features**: Create a new folder in `features/` with appropriate components and index file
2. **Shared Components**: Add reusable components to `shared/components/`
3. **Hooks**: Place custom hooks in `shared/hooks/` if reusable, or within specific features if feature-specific
4. **State Management**: Add new context providers to `providers/` folder
5. **Utilities**: Add utility functions to `shared/utils/`

This structure provides a solid foundation for continued development and scaling of the application.
