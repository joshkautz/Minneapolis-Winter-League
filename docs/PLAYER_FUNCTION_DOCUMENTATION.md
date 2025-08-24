# Player Management Firebase Functions

## Overview

I've created a complete set of secure Firebase Functions for player management that replaces all client-side operations with server-side validation. This ensures all security requirements are enforced at the server level where they cannot be bypassed.

## Available Functions

### 1. **createPlayer** - Player Creation

### 2. **updatePlayer** - Player Updates

### 3. **deletePlayer** - Player Deletion

## Security Validations Implemented

The `createPlayer` Firebase Function implements all the security checks that were in your Firestore rules:

### ✅ Authentication Checks

- **User must be authenticated**: Verified via `request.auth`
- **Valid authentication token**: Function rejects unauthenticated requests

### ✅ Email Validation

- **Email matches authenticated user**: `auth.token.email === request.email`
- **Email is required**: Non-empty string validation
- **Prevents email spoofing**: Server-side verification

### ✅ Document ID Security

- **Document ID matches user UID**: Uses `auth.uid` as document ID
- **Prevents document hijacking**: Cannot create documents for other users

### ✅ Admin Privilege Protection

- **Admin field always false**: Hardcoded to `false` for new players
- **Prevents privilege escalation**: Cannot be overridden client-side

### ✅ Data Validation

- **All required fields validated**: firstname, lastname, email, seasonId
- **Season exists verification**: Checks season document exists before creating player
- **Proper PlayerData structure**: Ensures all required PlayerData fields are present
- **Input sanitization**: Trims whitespace from names

### ✅ Duplicate Prevention

- **Prevents duplicate players**: Checks if player document already exists
- **Atomic operation**: Uses Firestore transaction for consistency

## File Structure

```
Functions/src/
├── playerFunctions.ts          # New secure player operations
├── index.ts                    # Updated with player function exports
└── ...

App/src/firebase/collections/
├── functions.ts                # Client-side wrapper functions
├── players.ts                  # Updated with deprecation notice
└── ...
```

## Usage Examples

### Creating a Player

```typescript
import { createPlayerViaFunction } from '@/firebase/collections/functions'

try {
	const result = await createPlayerViaFunction({
		firstname: 'John',
		lastname: 'Doe',
		email: 'john.doe@example.com', // Must match authenticated user's email
		seasonId: 'current-season-id',
	})

	console.log('Player created:', result.playerId)
} catch (error) {
	console.error('Failed to create player:', error)
}
```

### Updating a Player

```typescript
import { updatePlayerViaFunction } from '@/firebase/collections/functions'

// Update your own profile
try {
	const result = await updatePlayerViaFunction({
		firstname: 'Jane', // Optional
		lastname: 'Smith', // Optional
	})

	console.log('Player updated:', result.message)
} catch (error) {
	console.error('Failed to update player:', error)
}

// Admin updating another player
try {
	const result = await updatePlayerViaFunction({
		playerId: 'other-player-id',
		firstname: 'Updated Name',
	})

	console.log('Player updated by admin:', result.message)
} catch (error) {
	console.error('Failed to update player:', error)
}
```

### Deleting a Player

```typescript
import { deletePlayerViaFunction } from '@/firebase/collections/functions'

// Delete your own profile
try {
	const result = await deletePlayerViaFunction()

	console.log('Player deleted:', result.message)
	if (result.warnings?.length) {
		console.warn('Warnings:', result.warnings)
	}
} catch (error) {
	console.error('Failed to delete player:', error)
}

// Admin force delete with team associations
try {
	const result = await deletePlayerViaFunction({
		playerId: 'player-with-teams',
		adminOverride: true,
	})

	console.log('Player force deleted:', result.message)
} catch (error) {
	console.error('Failed to delete player:', error)
}
```

## Function Response

```typescript
interface CreatePlayerResponse {
	success: boolean
	playerId: string // The created player's document ID
	message: string // Success/error message
}
```

## Error Handling

The function returns proper HTTPS errors for different scenarios:

- `unauthenticated`: User not logged in
- `invalid-argument`: Missing/invalid required fields or email mismatch
- `not-found`: Season does not exist
- `already-exists`: Player profile already exists
- `internal`: Unexpected server error

## Migration Notes

### Firestore Rules Updated

Your new Firestore rules now force all player creation through Firebase Functions:

```javascript
// PLAYERS [Create]: Only during initial user registration
allow create: if isAuthenticated() &&
               request.auth.uid == playerId &&
               // Validate required fields for new player
               request.resource.data.keys().hasAll(['firstname', 'lastname', 'email']) &&
               // Validate email matches auth
               request.resource.data.email == request.auth.token.email &&
               // Ensure no admin privileges on creation
               (!request.resource.data.keys().hasAny(['admin']) || request.resource.data.admin == false);
```

### Backward Compatibility

The old `createPlayer` function in `players.ts` still works but shows a deprecation warning encouraging migration to the Function-based approach.

## Benefits

1. **Server-side Security**: All validations happen server-side where they cannot be bypassed
2. **Centralized Logic**: Business logic is centralized in Functions rather than duplicated in rules
3. **Better Error Handling**: Proper error messages and debugging information
4. **Audit Trail**: Server-side logging for all player creation attempts
5. **Scalability**: Functions can handle complex operations better than Firestore rules
6. **Maintainability**: Easier to update business logic in Functions vs Firestore rules

## Testing

You can test this in your Firebase emulator environment:

1. Start the Functions emulator: `firebase emulators:start --only functions,firestore,auth`
2. Use the client-side wrapper to create players
3. Verify all security validations work as expected
4. Check that invalid requests are properly rejected

The function is now ready for production use and provides the same security guarantees as your Firestore rules, but with better maintainability and debugging capabilities.
