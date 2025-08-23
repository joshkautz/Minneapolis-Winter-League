# Project Structure

This React application follows modern best practices for scalable frontend architecture. The structure is organized around features, with clear separation of concerns and reusable components.

## Directory Structure

```text
src/
├── components/ui/          # shadcn/ui components (Radix UI primitives)
├── features/              # Feature-based organization
│   ├── auth/             # Authentication feature
│   ├── home/             # Home page components
│   ├── teams/            # Teams management
│   ├── profile/          # User profile
│   ├── schedule/         # Game schedule
│   ├── standings/        # League standings
│   ├── create/           # Team creation
│   ├── manage/           # Team management
│   └── index.ts          # Feature barrel exports
├── shared/               # Shared/common modules
│   ├── components/       # Reusable UI components
│   ├── hooks/           # Custom React hooks
│   ├── utils/           # Utility functions & interfaces
│   └── index.ts         # Shared barrel exports
├── providers/           # Context providers & state management
├── pages/              # Page-level components (error pages, etc.)
├── routes/             # Route configuration & lazy loading
├── firebase/           # Firebase configuration & services
├── App.tsx             # Root application component
├── main.tsx            # Application entry point
└── globals.css         # Global styles
```

## Architecture Principles

### 1. Feature-Based Organization

- Each feature has its own folder with all related components
- Features are self-contained and can be easily moved or removed
- Barrel exports (`index.ts`) provide clean import paths

### 2. Separation of Concerns

- **Features**: Business logic and feature-specific components
- **Shared**: Reusable components, hooks, and utilities
- **Providers**: State management and context providers
- **Components/UI**: Design system components (shadcn/ui)

### 3. Import Path Conventions

```typescript
// Feature imports
import { Home } from '@/features/home'
import { AuthModal } from '@/features/auth'

// Shared imports
import { Layout, ProtectedRoute } from '@/shared/components'
import { useDebounce } from '@/shared/hooks'
import { cn } from '@/shared/utils'

// Provider imports
import { AuthContextProvider } from '@/providers'

// UI component imports
import { Button } from '@/components/ui/button'
```

### 4. Code Organization Best Practices

#### Component Structure

```typescript
// Feature component example
// features/auth/auth-modal.tsx
export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
  // Component logic
}

// Export from feature index
// features/auth/index.ts
export { AuthModal } from './auth-modal'
```

#### Hook Organization

```typescript
// Custom hooks in shared/hooks/
export const useCustomHook = () => {
  // Hook logic
}

// Feature-specific hooks stay within the feature folder
```

#### Utility Functions

```typescript
// Shared utilities in shared/utils/
export const formatDate = (date: Date) => {
  // Utility logic
}

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
