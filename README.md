# Minneapolis Winter League

A modern web application for managing Minneapolis Winter League hockey seasons, teams, and games.

| Environment | Status                                                                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | [![Production GitHub Workflow Status](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml) |
| Staging     | [![Staging GitHub Workflow Status](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml)    |

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Firebase (Auth, Firestore, Functions, Storage)
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Validation**: Zod
- **Development**: Firebase Emulators + Hot Reload

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Firebase CLI (`npm install -g firebase-tools`)

### Development Setup

1. **Clone and install dependencies**:

   ```bash
   git clone https://github.com/joshkautz/Minneapolis-Winter-League.git
   cd Minneapolis-Winter-League
   npm install
   cd App && npm install
   ```

2. **Start Firebase emulators** (from project root):

   ```bash
   npm run dev
   ```

3. **Start the React app** (in a new terminal):

   ```bash
   cd App
   npm run dev:emulators
   ```

4. **Access the application**:
   - App: <http://localhost:5173>
   - Firebase Emulator UI: <http://localhost:4000>

## Documentation

| Document                                                     | Description                             |
| ------------------------------------------------------------ | --------------------------------------- |
| [Development Setup Guide](./docs/DEVELOPMENT_SETUP.md)       | Complete development environment setup  |
| [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)     | Environment configuration and variables |
| [Authentication System](./docs/AUTHENTICATION_SYSTEM.md)     | Auth system architecture and components |
| [Project Structure](./docs/PROJECT_STRUCTURE.md)             | Codebase organization and conventions   |
| [Bundle Optimization](./docs/BUNDLE_OPTIMIZATION.md)         | Performance and build optimization      |
| [TypeScript Improvements](./docs/TYPESCRIPT_IMPROVEMENTS.md) | Type safety enhancements                |
| [Security Guidelines](./docs/SECURITY.md)                    | Security practices and rules            |
| [Zod Validation](./docs/ZOD_VALIDATION_ANALYSIS.md)          | Data validation patterns                |

## Project Structure

```
├── App/                     # React application
│   ├── src/
│   │   ├── features/        # Feature-based modules
│   │   ├── shared/          # Shared utilities and components
│   │   ├── firebase/        # Firebase configuration
│   │   └── components/ui/   # UI component library
│   └── public/              # Static assets
├── Functions/               # Firebase Cloud Functions
├── docs/                    # Documentation
├── emulator-data/           # Firebase emulator test data
└── firebase.json            # Firebase configuration
```

## Available Scripts

### Root Directory

```bash
npm run dev                  # Start emulators with test data
npm run dev:clean           # Start clean emulators
npm run emulators:export    # Export emulator data
npm run emulators:clear     # Clear emulator data
```

### App Directory

```bash
npm run dev                 # Development server
npm run dev:emulators      # Development with emulators
npm run build              # Production build
npm run build:staging      # Staging build
npm run test               # Run tests
```

## Deployment

### Preview Channel (Pull Requests)

1. Create a Pull Request
2. GitHub Actions automatically deploys to Firebase Hosting preview channel
3. Review changes at the preview URL

### Production Deployment

1. Merge Pull Request to `main` branch
2. GitHub Actions automatically deploys to production
3. Changes are live at the production URL

## Features

- **Season Management**: Create and manage hockey seasons
- **Team Organization**: Team registration and roster management
- **Game Scheduling**: Schedule and track game results
- **Player Profiles**: Individual player statistics and information
- **Authentication**: Secure user registration and login
- **Responsive Design**: Works on desktop and mobile devices

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 2. Firebase Hosting GitHub Action will build and deploy the new changes to the Live Channel on Firebase Hosting.

## Deploy Functions 📦

### Deploy Functions to Production

1. Create a Pull Request to merge a new feature branch into the Main branch.
2. Merge the Pull Request into the Main branch.
3. Firebase Hosting GitHub Action will deploy the new changes to the production environment.

# TODO:

Allow players to include messages in their team requests so they can have a better chance of joining a team.
Add a karma mechanism so teams can get more karma by allowing individuals onto their team.
Add a flag to teams that indicates that they're looking for more players, so individuals weel welcome to request to join them.
Add a mechanism so teams with the most karma have priority seeding for our already established seeding format, rather than going randomly (which was prviously alphabetically)
