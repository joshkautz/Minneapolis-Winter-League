# Firebase Functions Migration Guide

This document outlines changes made during the Firebase Functions reorganization.

## Function Renames and Migrations

### Removed/Renamed Functions

The following functions have been removed or renamed for better organization:

#### Authentication Functions

- **`OnUserDeleted`** → **`userDeleted`**
  - Moved to: `triggers/authTriggers.ts`
  - Improved error handling and transaction safety

#### Payment and Waiver Functions

- **`OnPaymentCreated`** → **`onPaymentCreated`**
  - Moved to: `triggers/paymentTriggers.ts`
  - Simplified logic and improved error handling
- **`dropboxSignHandleWebhookEvents`** → **`dropboxSignWebhook`**
  - Moved to: `triggers/paymentTriggers.ts`
  - Better webhook validation and error handling
- **`dropboxSignSendReminderEmail`** (NEW IMPLEMENTATION)
  - Moved to: `functions/dropboxSign/dropboxSignSendReminderEmail.ts`
  - Completely rewritten to use proper Dropbox Sign reminder API
  - Previous `resendWaiverEmail` was deprecated (created duplicate signature requests)
  - Now queries waivers collection for proper authorization
  - Gen 1 callable function for consistency with other callable functions

#### Team Registration Functions

- **`SetTeamRegistered_OnPlayerChange`** → **`updateTeamRegistrationOnPlayerChange`**
  - Moved to: `triggers/teamTriggers.ts`
  - Simplified logic using helper functions
- **`SetTeamRegistered_OnTeamChange`** → **`updateTeamRegistrationOnRosterChange`**
  - Moved to: `triggers/teamTriggers.ts`
  - Improved efficiency and error handling
- **`SetTeamRegisteredDate_OnTeamRegisteredChange`** → **`updateTeamRegistrationDate`**
  - Moved to: `triggers/teamTriggers.ts`
  - Simplified implementation

#### Offer Functions

- **`OnOfferAccepted`** → **Removed** (logic moved to `onOfferUpdated`)
- **`OnOfferRejected`** → **Removed** (logic moved to `onOfferUpdated`)
  - Both functions' logic consolidated in `offerFunctions.ts`
  - Better transaction handling and error recovery

## Breaking Changes

### Function Names

If you have direct references to the old function names in:

- Firebase console triggers
- Client-side callable function calls
- Other Firebase projects

You'll need to update them to use the new names.

### Import Paths

All functions are still exported from `index.ts`, so imports should continue to work unchanged.

## Improvements Made

### Code Organization

- Functions grouped by functionality
- Shared utilities extracted to reduce duplication
- Better separation of concerns

### Error Handling

- Standardized error handling across all functions
- Better logging with context
- Graceful error recovery where possible

### Performance

- Reduced code duplication
- Better transaction usage
- Optimized Firestore queries

### Maintainability

- Comprehensive TypeScript typing
- Shared constants and configuration
- Modular architecture
- Clear documentation

## Configuration Changes

### Environment Variables

- Added validation for required environment variables
- Proper fallbacks for development environment
- Centralized configuration management

### Constants

- Moved hardcoded values to configuration files
- Environment-specific settings
- Business logic constants centralized

## Testing Recommendations

After deployment, verify that:

1. All trigger functions are properly registered in Firebase Console
2. Callable functions work from client applications
3. Webhook endpoints respond correctly
4. Authentication and authorization work as expected
5. Error scenarios are handled gracefully

## Rollback Plan

If issues arise, you can rollback by:

1. Reverting to the previous index.ts structure
2. Re-deploying the original function implementations
3. Updating any client code that may have changed

The original implementations are preserved in git history for reference.
