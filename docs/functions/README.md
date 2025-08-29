# Firebase Functions

This directory contains all Firebase Functions for the Minneapolis Winter League application. The functions are organized by functionality for better maintainability and testing.

## Directory Structure

```
src/
├── index.ts                 # Main entry point - exports all functions
├── initializeApp.ts         # Firebase Admin initialization
├── config/
│   ├── constants.ts         # Application constants and configuration
│   └── environment.ts       # Environment variable validation
├── utils/
│   └── helpers.ts          # Shared utility functions
├── triggers/
│   ├── authTriggers.ts     # Authentication event triggers
│   ├── paymentTriggers.ts  # Payment and waiver related triggers
│   └── teamTriggers.ts     # Team registration status triggers
├── playerFunctions.ts      # Player management callable functions
├── teamFunctions.ts        # Team management callable functions
├── offerFunctions.ts       # Offer management callable functions
└── storageFunctions.ts     # File storage callable functions
```

## Function Types

### Trigger Functions (Event-driven)

#### Authentication Triggers (`triggers/authTriggers.ts`)

- **`userDeleted`** - Cleans up all player data when a user account is deleted

#### Payment & Waiver Triggers (`triggers/paymentTriggers.ts`)

- **`onPaymentCreated`** - Processes successful payments and creates waiver requests
- **`dropboxSignWebhook`** - Handles Dropbox Sign webhook events for waiver signing
- **`resendWaiverEmail`** - Allows players to request waiver email reminders

#### Team Registration Triggers (`triggers/teamTriggers.ts`)

- **`updateTeamRegistrationOnPlayerChange`** - Updates team status when player payment/waiver changes
- **`updateTeamRegistrationOnRosterChange`** - Updates team status when roster changes
- **`updateTeamRegistrationDate`** - Timestamps registration status changes

### Callable Functions (Client-invoked)

#### Player Management (`playerFunctions.ts`)

- **`createPlayer`** - Creates new player profiles
- **`updatePlayer`** - Updates player information
- **`deletePlayer`** - Deletes player profiles (admin only)

#### Team Management (`teamFunctions.ts`)

- **`createTeam`** - Creates new teams
- **`deleteTeam`** - Deletes teams (captain only)
- **`manageTeamPlayer`** - Manages team roster (promote/demote/remove players)
- **`editTeam`** - Updates team information

#### Offer Management (`offerFunctions.ts`)

- **`createOffer`** - Creates team invitations/requests
- **`updateOfferStatus`** - Accepts/rejects offers
- **`onOfferUpdated`** - Processes offer status changes
- **`cleanupOffers`** - Removes stale offers (admin only)

#### Storage Functions (`storageFunctions.ts`)

- **`getUploadUrl`** - Generates signed upload URLs
- **`getDownloadUrl`** - Generates signed download URLs
- **`getFileMetadata`** - Retrieves file metadata

## Configuration

### Environment Variables

Required environment variables:

- **`DROPBOX_SIGN_API_KEY`** - Dropbox Sign API key for waiver management
- **`NODE_ENV`** - Environment (development/production)

### Constants

Key configuration constants are defined in `config/constants.ts`:

- Dropbox Sign settings (API key, template ID, test mode)
- Firebase settings (region, CORS origins)
- Business logic settings (minimum players for team registration)
- Email templates

## Best Practices Implemented

### Security

- All functions validate authentication and authorization
- Input validation on all user data
- Environment variable validation
- Proper error handling and logging

### Performance

- Efficient Firestore queries with proper indexing
- Transaction usage for data consistency
- Minimal function cold starts through proper imports

### Maintainability

- Modular organization by functionality
- Shared utilities to reduce code duplication
- Comprehensive TypeScript typing
- Standardized error handling
- Clear documentation and comments

### Firebase Best Practices

- Gen 2 functions for new features (better performance)
- Gen 1 functions only where necessary (auth triggers)
- Proper function naming conventions
- Appropriate timeouts and memory allocation
- CORS configuration for web clients

## Development Guidelines

### Adding New Functions

1. **Determine function type**: Trigger (event-driven) or Callable (client-invoked)
2. **Choose appropriate file**: Add to existing file or create new module
3. **Follow naming conventions**:
   - Triggers: `onEventHappened` or `updateSomethingOnChange`
   - Callables: `actionResource` (e.g., `createPlayer`, `updateTeam`)
4. **Add comprehensive validation**: Authentication, input validation, business rules
5. **Use shared utilities**: Leverage helpers for common operations
6. **Add proper error handling**: Use `handleFunctionError` utility
7. **Export from index.ts**: Make function available to clients

### Testing & Development

#### Hot Reloading Development (Recommended)

```bash
# From project root - start with Functions hot reload
npm run dev:watch

# Functions will automatically recompile and reload when TypeScript files change
# No need to manually rebuild or restart emulators
```

#### Manual Development

```bash
# Build Functions manually after changes
cd Functions && npm run build

# Start emulators separately
npm run emulators:start
```

#### Testing Guidelines

- Test functions locally using Firebase emulator
- Use test data from `.emulator/` directory
- Validate authentication flows
- Test error scenarios and edge cases
- Functions hot reload automatically during development

### Deployment

Functions are deployed as part of the overall Firebase project deployment. Individual functions can be deployed using:

```bash
firebase deploy --only functions:functionName
```

## Error Handling

All functions use standardized error handling:

- Comprehensive logging with context
- Proper HTTP status codes for callable functions
- Graceful degradation where possible
- User-friendly error messages

## Monitoring

Functions include logging for:

- Function execution start/completion
- Business logic events (user creation, team registration, etc.)
- Errors with full context
- Performance metrics

## Security Considerations

- All callable functions require authentication
- Email verification required for most operations
- Admin-only functions have proper authorization checks
- Input sanitization and validation
- Rate limiting through Firebase's built-in protections
