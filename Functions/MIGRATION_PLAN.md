# Firebase Functions Migration Plan

This document outlines the step-by-step migration from the current function organization to the new structured approach.

## Current vs New Organization

### Before (Current)

```
src/
├── index.ts
├── playerFunctions.ts
├── teamFunctions.ts
├── offerFunctions.ts
├── storageFunctions.ts
├── triggers/
│   ├── authTriggers.ts
│   ├── paymentTriggers.ts
│   └── teamTriggers.ts
├── config/
└── utils/
```

### After (New)

```
src/
├── index.ts
├── shared/            # Extracted from utils/
├── triggers/          # Reorganized by event type
├── api/              # New category for webhooks
├── functions/        # Reorganized by domain
└── services/         # New category for business logic
```

## Migration Steps

### Phase 1: Infrastructure ✅ COMPLETED

- [x] Create new directory structure
- [x] Create shared utilities (`shared/`)
- [x] Migrate helper functions to appropriate shared modules
- [x] Create organization documentation

### Phase 2: Trigger Functions ✅ COMPLETED

- [x] Migrate `authTriggers.ts` → `triggers/auth/userDeleted.ts`
- [x] Extract webhook from `paymentTriggers.ts` → `api/webhooks/dropboxSign.ts`
- [x] Migrate payment trigger → `triggers/payments/paymentCreated.ts`
- [x] Migrate team triggers → `triggers/documents/teamUpdated.ts`
- [x] Create offer trigger → `triggers/documents/offerUpdated.ts`
- [x] Create player trigger → `triggers/documents/playerUpdated.ts`

### Phase 3: Callable Functions 🔄 IN PROGRESS

- [x] Migrate player functions → `functions/players/`
  - [x] `create.ts`
  - [x] `update.ts`
  - [x] `delete.ts`
- [x] Start team functions → `functions/teams/`
  - [x] `create.ts`
  - [x] `update.ts`
  - [ ] `delete.ts`
  - [ ] `managePlayer.ts`
- [ ] Migrate offer functions → `functions/offers/`
  - [ ] `create.ts`
  - [ ] `updateStatus.ts`
  - [ ] `cleanup.ts`
- [ ] Migrate storage functions → `functions/storage/`
  - [ ] `getUploadUrl.ts`
  - [ ] `getDownloadUrl.ts`
  - [ ] `getFileMetadata.ts`

### Phase 4: Services 🔄 IN PROGRESS

- [x] Create `services/waiverService.ts`
- [x] Create `services/teamRegistrationService.ts`
- [ ] Create `services/notificationService.ts`

### Phase 5: Testing & Deployment ⏳ PENDING

- [ ] Update import paths in index.ts
- [ ] Test all functions locally
- [ ] Update client-side function calls
- [ ] Deploy and verify in staging
- [ ] Deploy to production
- [ ] Remove old files

## Detailed Migration Tasks

### Remaining Team Functions

1. **Delete Team** (`teamFunctions.ts` → `functions/teams/delete.ts`)
   - Extract delete team logic
   - Add proper validation and cleanup
   - Handle player roster updates

2. **Manage Team Player** (`teamFunctions.ts` → `functions/teams/managePlayer.ts`)
   - Extract promote/demote/remove logic
   - Ensure transaction safety
   - Update player season data

### Offer Functions Migration

1. **Create Offer** (`offerFunctions.ts` → `functions/offers/create.ts`)
   - Extract createOffer function
   - Maintain validation logic
   - Use shared utilities

2. **Update Offer Status** (`offerFunctions.ts` → `functions/offers/updateStatus.ts`)
   - Extract updateOfferStatus function
   - Keep security validations
   - Use shared error handling

3. **Cleanup Offers** (`offerFunctions.ts` → `functions/offers/cleanup.ts`)
   - Extract cleanupOffers function
   - Maintain admin-only access
   - Add comprehensive logging

### Storage Functions Migration

1. **Get Upload URL** (`storageFunctions.ts` → `functions/storage/getUploadUrl.ts`)
   - Extract getUploadUrl function
   - Keep security validations
   - Maintain file type restrictions

2. **Get Download URL** (`storageFunctions.ts` → `functions/storage/getDownloadUrl.ts`)
   - Extract getDownloadUrl function
   - Keep access controls
   - Maintain URL expiration

3. **Get File Metadata** (`storageFunctions.ts` → `functions/storage/getFileMetadata.ts`)
   - Extract getFileMetadata function
   - Keep security checks
   - Add error handling

## Breaking Changes

### Import Path Changes

All function imports will need to be updated in the client application:

```typescript
// Before
import { createPlayer } from 'firebase-functions/playerFunctions'

// After
import { createPlayer } from 'firebase-functions/functions/players/create'
```

### Function Export Changes

The main index.ts will export all functions with the same names, so cloud function names remain the same.

## Rollback Plan

If issues arise during migration:

1. **Keep old files** until migration is complete
2. **Maintain parallel exports** in index.ts during transition
3. **Test thoroughly** in staging environment
4. **Have immediate rollback** capability by reverting index.ts exports

## Validation Checklist

### Pre-Migration ✅

- [x] Document current function organization
- [x] Identify all function dependencies
- [x] Create new directory structure
- [x] Plan migration phases

### During Migration 🔄

- [x] Test each migrated function
- [x] Maintain backward compatibility
- [x] Update documentation
- [ ] Monitor for TypeScript errors

### Post-Migration ⏳

- [ ] Verify all functions deploy successfully
- [ ] Test end-to-end functionality
- [ ] Update client-side imports
- [ ] Remove old files
- [ ] Update deployment documentation

## Risk Mitigation

1. **Gradual Migration**: Moving functions in phases reduces risk
2. **Parallel Structure**: New structure alongside old until complete
3. **Comprehensive Testing**: Each function tested before migration
4. **Documentation**: Clear documentation of changes and rationale
5. **Rollback Plan**: Ability to quickly revert if issues arise

## Success Metrics

1. **All functions deploy successfully**
2. **No increase in function execution time**
3. **Improved code maintainability score**
4. **Reduced technical debt**
5. **Enhanced developer productivity**

The migration improves code organization, maintainability, and developer experience while maintaining full functionality and backward compatibility.
