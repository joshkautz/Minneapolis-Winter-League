# Firebase Infrastructure Documentation

This directory contains documentation for Firebase services configuration and setup.

## 📚 Documents

### Core Configuration

- **[Firebase Migration](./FIREBASE_MIGRATION.md)** - Migration strategies and guides
- **[Firebase Collections README](./FIREBASE_COLLECTIONS_README.md)** - Firestore data models and collections
- **[Firestore Indexes](./FIRESTORE_INDEXES.md)** - Database indexing configuration
- **[Security Migration](./SECURITY_MIGRATION.md)** - Security rules and access patterns

### Emulator Development

- **[Emulator Data README](./EMULATOR_DATA_README.md)** - Working with Firebase Emulator Suite
- **[Authentication System](./AUTHENTICATION_SYSTEM.md)** - Firebase Auth implementation
- **[Security Documentation](./SECURITY.md)** - Security rules and best practices

## 🔥 Firebase Services

### Active Services

```
Firebase Project: Minneapolis Winter League
├── Authentication      # User management and OAuth
├── Firestore          # NoSQL document database
├── Cloud Functions     # Serverless backend logic
├── Cloud Storage       # File and image storage
└── Hosting            # Static site deployment
```

### Service Configuration

- **Authentication**: Email/password, Google OAuth, custom claims
- **Firestore**: Multi-collection NoSQL with security rules
- **Functions**: TypeScript-based callable and triggered functions
- **Storage**: Image uploads with security rules
- **Hosting**: React SPA with routing support

## 📊 Firestore Collections

### Core Collections

```
/players           # Player profiles and data
/teams            # Team information and rosters
/seasons          # Season configuration
/offers           # Team invitations and requests
/waivers          # Legal waiver tracking
/games            # Game schedules and results
/payments         # Stripe payment records
```

### Collection Patterns

- **Document IDs**: Auto-generated or user-based
- **Subcollections**: Used for season-specific data
- **Indexes**: Configured for common query patterns
- **Security**: Rule-based access control

## 🔒 Security Architecture

### Functions-First Security

The application uses a functions-first security model:

1. **Client permissions**: Minimal read-only access
2. **Functions authority**: All writes go through Cloud Functions
3. **Data validation**: Server-side validation with Zod schemas
4. **Access control**: Custom claims and context checking

### Security Rules

```javascript
// Firestore rules enforce function-only writes
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Most collections: read-only for authenticated users
    match /players/{document} {
      allow read: if request.auth != null;
      allow write: if false; // Functions only
    }
  }
}
```

## 🛠️ Emulator Development

### Emulator Suite

The project uses Firebase Emulator Suite for local development:

```bash
# Start all emulators
firebase emulators:start

# Services running locally:
# - Authentication: localhost:9099
# - Firestore: localhost:8080
# - Functions: localhost:5001
# - Storage: localhost:9199
# - Hosting: localhost:5000
```

### Test Data

- **Seed data**: Located in `/.emulator/`
- **Import/Export**: Automated data management
- **Reset**: Fresh start for each development session

## 📈 Indexes and Performance

### Composite Indexes

Required for complex queries:

```javascript
// Example: Query players by season and status
players
	.where('season', '==', '2024-25')
	.where('status', '==', 'active')
	.orderBy('lastName')
```

### Index Configuration

- **Automatic**: Simple field indexes
- **Composite**: Multi-field queries
- **Array**: Array-contains queries
- **TTL**: Time-based document expiration

## 🚀 Deployment Pipeline

### Environment Management

```
Development → Staging → Production
    ↓           ↓          ↓
 Emulators → Preview → Live Firebase
```

### Deployment Commands

```bash
# Deploy all services
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

## 🔮 Future Enhancements

- **Analytics**: Firebase Analytics integration
- **Crashlytics**: Error reporting and monitoring
- **Performance**: Performance monitoring
- **Extensions**: Firebase Extensions marketplace
- **Cloud SQL**: Relational data for complex queries
