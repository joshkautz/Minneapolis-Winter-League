# Minneapolis Winter League

A modern, secure web application for managing Minneapolis Winter League hockey seasons, teams, and games. Built with React, TypeScript, and Firebase with a focus on security and performance.

| Environment | Status                                                                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | [![Production GitHub Workflow Status](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml) |
| Staging     | [![Staging GitHub Workflow Status](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml)    |

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/joshkautz/Minneapolis-Winter-League.git
cd Minneapolis-Winter-League
npm install

# Start development environment
npm run dev                    # Start Firebase emulators
cd App && npm run dev:emulators # Start React app (new terminal)
```

**Access Points:**

- App: <http://localhost:5173>
- Firebase Emulator UI: <http://localhost:4000>

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Functions Gen 2, Storage, Hosting)
- **Security**: Firebase Functions-first architecture with strict Firestore rules
- **Validation**: Zod with shared type definitions
- **Payments**: Stripe integration
- **Development**: Firebase Emulators with hot reload

## 📚 Documentation

| Category                       | Documents                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Setup & Development**        | [Development Setup](./docs/DEVELOPMENT_SETUP.md) • [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md) • [Project Structure](./docs/PROJECT_STRUCTURE.md)                             |
| **Security & Architecture**    | [Firebase Functions Migration](./docs/FIREBASE_FUNCTIONS_MIGRATION_STATUS.md) • [Security Guidelines](./docs/SECURITY.md) • [Authentication System](./docs/AUTHENTICATION_SYSTEM.md)       |
| **Firebase Integration**       | [Firebase Migration Guide](./docs/FIREBASE_MIGRATION.md) • [Firebase Collections](./docs/FIREBASE_COLLECTIONS_README.md) • [Player Function Docs](./docs/PLAYER_FUNCTION_DOCUMENTATION.md) |
| **Type Safety & Validation**   | [Shared Types Migration](./docs/SHARED_TYPES_MIGRATION.md) • [Zod Validation](./docs/ZOD_VALIDATION_ANALYSIS.md) • [TypeScript Improvements](./docs/TYPESCRIPT_IMPROVEMENTS.md)            |
| **Performance & Optimization** | [Bundle Optimization](./docs/BUNDLE_OPTIMIZATION.md)                                                                                                                                       |

## 🏗️ Architecture

```
├── App/                     # React application (Vite + TypeScript)
│   ├── src/features/        # Feature-based modules
│   ├── src/firebase/        # Firebase SDK integration
│   └── src/shared/          # Shared utilities & components
├── Functions/               # Firebase Cloud Functions (Gen 2)
│   ├── src/playerFunctions.ts    # Player CRUD operations
│   ├── src/teamFunctions.ts      # Team management
│   └── src/offerFunctions.ts     # Invitation/request workflow
├── Shared/                  # Shared TypeScript types and validation
├── docs/                    # Complete documentation
└── .emulator/           # Development test data
```

## 🔐 Security Features

- **Functions-First Architecture**: All write operations server-side only
- **Zero Client-Side Writes**: Firestore rules deny all client writes to core collections
- **Role-Based Authorization**: Captain/Player/Admin permissions enforced
- **Email Verification Required**: All operations require verified accounts
- **Atomic Transactions**: Multi-document consistency guaranteed
- **Comprehensive Audit Logging**: All actions tracked with user context

## 🎯 Key Features

- **Season Management**: Complete season lifecycle with automated workflows
- **Team Organization**: Secure team creation, editing, and roster management
- **Player Profiles**: Individual statistics and team history
- **Invitation System**: Secure team invitations and join requests
- **Game Scheduling**: Automated scheduling and result tracking
- **Payment Integration**: Stripe checkout for registration
- **Mobile Responsive**: Full mobile experience with PWA support

## 🚀 Deployment

### Automatic Deployments

- **Pull Requests**: Auto-deploy to Firebase Hosting preview channels
- **Main Branch**: Auto-deploy to production on merge
- **Functions**: Deploy via Firebase CLI or GitHub Actions

### Scripts

```bash
# Development
npm run dev                  # Start emulators with test data
npm run dev:clean           # Start clean emulators

# Production
npm run build               # Build for production
npm run deploy              # Deploy to Firebase
```

## 📈 Recent Major Updates

- ✅ **Security Migration Complete**: All operations moved to secure Firebase Functions
- ✅ **TypeScript Strict Mode**: Full type safety across codebase
- ✅ **Shared Package**: Centralized types and validation with @minneapolis-winter-league/shared
- ✅ **Firebase Functions Gen 2**: Modern serverless architecture
- ✅ **Zero Client-Side Writes**: Complete security lockdown

## 🔮 Upcoming Features

- **Enhanced Team Karma System**: Priority seeding based on team inclusivity
- **Player Request Messages**: Allow custom messages with team join requests
- **Team Availability Flags**: Teams can indicate they're looking for players
- **Advanced Analytics**: Detailed player and team statistics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the [Development Setup Guide](./docs/DEVELOPMENT_SETUP.md)
4. Make changes with tests
5. Submit a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
