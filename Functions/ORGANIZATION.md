# Firebase Functions Organization

This document describes the new organization structure for Firebase Functions in the Minneapolis Winter League project.

## Organization Strategy

The functions have been reorganized based on **function type and domain** to provide:

1. **Clear separation of concerns** - Similar functions are grouped together
2. **Easy maintenance** - Finding and updating functions is straightforward
3. **Consistent patterns** - Each category follows the same structure
4. **Type safety** - Shared utilities ensure consistent error handling and validation

## Directory Structure

```
src/
├── index.ts                    # Main entry point with all exports
├── initializeApp.ts           # Firebase Admin initialization
├── config/                    # Configuration files
│   ├── constants.ts           # Application constants
│   └── environment.ts         # Environment variable management
├── shared/                    # Shared utilities
│   ├── auth.ts               # Authentication helpers
│   ├── database.ts           # Database utilities
│   └── errors.ts             # Error handling utilities
├── triggers/                  # Firestore and Auth triggers
│   ├── auth/
│   │   └── userDeleted.ts    # User deletion cleanup
│   ├── documents/
│   │   ├── offerUpdated.ts   # Offer status changes
│   │   ├── playerUpdated.ts  # Player document changes
│   │   └── teamUpdated.ts    # Team document changes
│   └── payments/
│       └── paymentCreated.ts # Payment processing
├── api/                      # HTTP endpoints and webhooks
│   └── webhooks/
│       └── dropboxSign.ts    # Dropbox Sign callback handler
├── functions/                # Callable functions by domain
│   ├── players/
│   │   ├── create.ts         # Create player
│   │   ├── update.ts         # Update player
│   │   └── delete.ts         # Delete player
│   ├── teams/
│   │   ├── create.ts         # Create team
│   │   ├── update.ts         # Update team
│   │   ├── delete.ts         # Delete team
│   │   └── managePlayer.ts   # Add/remove/promote players
│   ├── offers/
│   │   ├── create.ts         # Create offer
│   │   ├── updateStatus.ts   # Accept/reject offers
│   │   └── cleanup.ts        # Clean up expired offers
│   └── storage/
│       ├── getUploadUrl.ts   # Generate upload URLs
│       ├── getDownloadUrl.ts # Generate download URLs
│       └── getFileMetadata.ts # Get file information
└── services/                 # Business logic services
    ├── waiverService.ts      # Waiver management
    ├── teamRegistrationService.ts # Team registration logic
    └── notificationService.ts # Email/SMS notifications
```

## Function Categories

### 1. Trigger Functions (`triggers/`)

**Purpose**: Respond to Firebase events (Auth, Firestore, Storage)
**Pattern**: Event-driven, automatic execution
**Organization**: By trigger source and event type

- **Authentication**: User lifecycle events
- **Documents**: Firestore document changes
- **Payments**: Stripe payment events

### 2. API Endpoints (`api/`)

**Purpose**: Handle HTTP requests and webhooks
**Pattern**: Request/response cycle
**Organization**: By integration type

- **Webhooks**: External service callbacks (Dropbox Sign, Stripe)

### 3. Callable Functions (`functions/`)

**Purpose**: Client-initiated operations with validation
**Pattern**: Request/response with authentication
**Organization**: By data domain (CRUD operations)

- **Players**: User account management
- **Teams**: Team management
- **Offers**: Invitation/request system
- **Storage**: File management

### 4. Services (`services/`)

**Purpose**: Reusable business logic
**Pattern**: Stateless utility functions
**Organization**: By business domain

- **Waiver Service**: Signature request management
- **Team Registration**: Registration status logic
- **Notification Service**: Communication handling

### 5. Shared Utilities (`shared/`)

**Purpose**: Common functionality used across functions
**Pattern**: Pure utility functions
**Organization**: By utility type

- **Auth**: Authentication and authorization helpers
- **Database**: Firestore query utilities
- **Errors**: Standardized error handling

## Benefits of This Organization

### 1. **Maintainability**

- Easy to find related functions
- Clear dependencies between modules
- Consistent error handling patterns

### 2. **Scalability**

- New functions follow established patterns
- Easy to add new domains or features
- Clear separation allows team collaboration

### 3. **Type Safety**

- Shared utilities ensure consistent typing
- Validation functions prevent runtime errors
- Clear interfaces for all function inputs

### 4. **Testing**

- Each module can be tested independently
- Shared utilities have comprehensive tests
- Clear boundaries for mocking

### 5. **Performance**

- Functions can be deployed independently
- Shared code reduces bundle size
- Clear imports prevent unnecessary dependencies

## Migration Status

### ✅ Completed

- Directory structure creation
- Shared utilities migration
- Authentication triggers
- Player functions
- Basic team functions
- Documentation

### 🔄 In Progress

- Team management functions
- Offer management functions
- Storage functions
- Service functions

### ⏳ Remaining

- Complete function migration
- Update deployment configuration
- Update client-side function calls
- Integration testing

## Usage Guidelines

### Adding New Functions

1. **Determine Category**: Trigger, API, Callable, or Service
2. **Choose Domain**: Which business area does it belong to?
3. **Follow Pattern**: Use existing functions as templates
4. **Use Shared Utilities**: Leverage auth, database, and error helpers
5. **Add to Index**: Export the function in `index.ts`

### Best Practices

1. **Validation**: Always use shared auth validation
2. **Error Handling**: Use shared error handling utilities
3. **Logging**: Include structured logging for debugging
4. **Documentation**: Add JSDoc comments for all functions
5. **Type Safety**: Use TypeScript interfaces for all inputs/outputs

### Example Function Structure

```typescript
/**
 * Function description
 */
import { onCall } from 'firebase-functions/v2/https'
import { validateAuthentication } from '../../shared/auth.js'

interface FunctionRequest {
	// Define request interface
}

export const functionName = onCall<FunctionRequest>(
	{ cors: true },
	async (request) => {
		// Validate authentication
		validateAuthentication(request.auth)

		try {
			// Function logic here

			return {
				success: true,
				message: 'Operation completed successfully',
			}
		} catch (error) {
			// Use shared error handling
			throw new Error(
				error instanceof Error ? error.message : 'Operation failed'
			)
		}
	}
)
```

This organization provides a solid foundation for maintaining and scaling the Firebase Functions codebase while ensuring consistency, type safety, and developer productivity.
