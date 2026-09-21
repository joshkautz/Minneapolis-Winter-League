# App Documentation

This directory contains documentation specific to the React application in `/App/`.

## 📚 Documents

### Performance & Optimization

- **[Bundle Optimization](./BUNDLE_OPTIMIZATION.md)** - Performance optimization strategies, code splitting, and bundle analysis

## 🏗️ App Architecture

The React application follows a modern, feature-based architecture:

```
App/src/
├── components/ui/          # shadcn/ui components
├── features/              # Feature-based modules
│   ├── auth/             # Authentication flows
│   ├── home/             # Landing page & public views
│   ├── profile/          # User profile management
│   ├── teams/            # Team management
│   ├── schedule/         # Game scheduling
│   └── standings/        # Season standings
├── firebase/             # Firebase SDK integration
├── shared/              # Shared utilities & components
└── providers/           # React context providers
```

## 🛠️ Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite with Hot Module Replacement
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React Query + Context API
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod validation
- **Firebase**: Firebase SDK v9 (modular)

## 🎯 Key Features

### Authentication

- Firebase Auth integration
- Email verification required
- Role-based UI (Player/Captain/Admin)
- Persistent login state

### Team Management

- Team creation and editing
- Roster management with drag-and-drop
- Captain promotion/demotion
- Team invitation system

### Game Scheduling

- Automated schedule generation
- Game result entry
- Real-time updates
- Mobile-responsive interface

### Player Profiles

- Individual statistics
- Team history
- Payment status
- Waiver management

## 🔒 Security Features

### Client-Side Security

- All write operations via Firebase Functions only
- Input validation with Zod schemas
- Role-based UI rendering
- Secure authentication flows

### Data Protection

- No sensitive data stored in client state
- Automatic token refresh
- Secure API calls to Functions
- CORS protection

## 📱 Mobile & Accessibility

### Responsive Design

- Mobile-first CSS approach
- Touch-friendly interfaces
- Responsive navigation
- Optimized for all screen sizes

### Accessibility

- ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- High contrast support

## 🚀 Development

### Local Development

```bash
cd App
npm run dev:emulators    # Start with Firebase emulators
npm run dev             # Start with production Firebase
```

### Building

```bash
npm run build           # Production build
npm run build:staging   # Loads .env.staging (which currently points at production)
npm run preview         # Preview production build
```

### Testing

```bash
npm run test            # Run tests
npm test   # Run with coverage
npm run test:watch         # Visual test runner
```

## 🔧 Configuration

### Environment Variables

See `docs/setup/ENVIRONMENT_VARIABLES.md` for complete configuration.

Key app-specific variables:

- `VITE_FIREBASE_CONFIG` - Firebase project configuration
- `VITE_APP_ENV` - Application environment

### Build Configuration

- **Vite Config**: `vite.config.ts` - Build optimization and dev server
- **TypeScript**: `tsconfig.json` - Strict type checking enabled
- **Tailwind**: `tailwind.config.js` - Design system configuration
- **ESLint**: `eslint.config.js` - Code quality rules

## 📊 Performance Monitoring

### Metrics Tracked

- Bundle size and performance
- Core Web Vitals
- User interaction metrics
- Error rates and types

### Optimization Strategies

- Code splitting by route
- Dynamic imports for heavy components
- Image optimization
- Lazy loading for non-critical content

## 🔮 Upcoming Features

- Progressive Web App (PWA) support
- Offline functionality
- Push notifications
- Enhanced mobile experience
- Advanced team analytics
