# Game Management Feature - Implementation Summary

## Overview

A comprehensive Game Management system for admin users to create, view, and update game documents in the Minneapolis Winter League application.

## Features Implemented

### 1. Firebase Functions (Backend)

#### `createGame` Function

**Location:** `/Functions/src/functions/admin/createGame.ts`

**Features:**

- Admin-only access validation
- Creates new game documents in Firestore
- Enforces business rules:
  - Games only on Saturdays
  - Games only in November and December
  - Only at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT
  - Each field (1, 2, or 3) can have only one game per time slot
- Prevents duplicate games (same time + field)
- Supports nullable team references (for TBD games)
- Comprehensive error handling and logging

**Validation:**

- Field must be 1, 2, or 3
- Scores must be non-negative numbers
- Season must exist
- Teams must exist (if provided)
- No duplicate game at same time and field

#### `updateGame` Function

**Location:** `/Functions/src/functions/admin/updateGame.ts`

**Features:**

- Admin-only access validation
- Updates existing game documents
- Same business rule validation as create
- Prevents creating duplicates when updating time/field
- Allows partial updates (only specified fields)
- Supports setting teams to null
- Comprehensive error handling and logging

#### `deleteGame` Function

**Location:** `/Functions/src/functions/admin/deleteGame.ts`

**Features:**

- Admin-only access validation
- Deletes game documents from Firestore
- Comprehensive error handling and logging
- Returns success confirmation with game ID

### 2. Client-Side Function Wrappers

**Location:** `/App/src/firebase/collections/functions.ts`

**Functions:**

- `createGameViaFunction()` - Create new games
- `updateGameViaFunction()` - Update existing games
- `deleteGameViaFunction()` - Delete games with admin confirmation

Both functions provide TypeScript type safety and proper error propagation.

### 3. Admin UI Component

**Location:** `/App/src/features/admin/game-management.tsx`

**Features:**

#### Game Creation and Editing

- **Season Selection:** Dropdown to select which season the game belongs to
- **Date Selection:** Date picker for scheduling games
- **Time Selection:** Time input for precise scheduling
- **Field Selection:** Fields 1-4 available
- **Team Selection:** Optional home/away team ID input (supports TBD/null teams)
- **Score Input:** Non-negative integer inputs for home and away scores (optional - leave empty for unplayed games)
- **Game Type:** Regular season or Playoff selection
- **Edit Mode:** Click edit button on any game to load it into the form
- **Cancel Editing:** Clear button to cancel edit mode and reset form

#### Game Deletion

- **Delete Button:** Trash icon button next to edit button for each game
- **Confirmation Dialog:** Modal dialog requiring user confirmation before deletion
- **Game Details Display:** Shows full game information in the confirmation dialog
- **Safe Deletion:** Prevents accidental deletion with explicit confirmation step

#### View Games Tab

- Table displaying all games across all seasons
- Shows: Date, Time, Field, Type, Home Team, Away Team, Scores
- "TBD" displayed for null team values
- "Not played yet" displayed for games without scores
- Edit button for each game
- Delete button for each game
- Empty state when no games exist
- Sorts games by date (chronological order)

#### User Experience

- Toast notifications for all operations (success/error)
- Clear error messages with specific details
- Loading states while fetching data
- Admin-only access with permission checking
- Clean, intuitive interface using shadcn/ui components
- Responsive design with proper overflow handling

### 4. Integration

**Admin Dashboard:**

- Added "Game Management" card linking to `/admin/game-management`
- Card shows icon and description

**Routing:**

- Route: `/admin/game-management`
- Protected by authentication
- Wrapped in ErrorBoundary
- Lazy loaded for performance

**Exports:**

- Added to `/App/src/features/admin/index.ts`
- Added to `/App/src/routes/route-components.ts`
- Added to `/App/src/routes/app-routes.tsx`

## Business Logic Enforced

### Time Constraints

- **Days:** Saturdays only
- **Months:** November and December only
- **Times:** 6:00pm, 6:45pm, 7:30pm, 8:15pm (Central Time)

### Scheduling Constraints

- 3 fields available
- Each field can have 1 game per time slot
- Each Saturday has 4 time slots
- Maximum 12 games per Saturday (3 fields × 4 time slots)

### Data Constraints

- Scores must be non-negative integers
- Teams are optional (nullable references for TBD games)
- Season reference is required
- Field must be 1, 2, or 3
- Game type must be 'regular' or 'playoff'

## Error Handling

### Backend (Firebase Functions)

- Admin authentication validation
- Input validation with descriptive error messages
- Duplicate detection with helpful messages
- Business rule violations clearly explained
- All errors logged with context
- Proper HttpsError types for client handling

### Frontend (UI)

- Form validation before submission
- Toast notifications for success/errors
- Loading states during operations
- Disabled states for invalid selections
- Clear error messages from backend

## Security

### Access Control

- Only admin users can invoke these functions
- Validated via `validateAdminUser()` helper
- Non-admin users see "Access Denied" message

### Data Validation

- Server-side validation prevents malicious data
- Client-side validation improves UX
- Type safety throughout the stack

## Usage

### Creating a Game

1. Navigate to Admin Dashboard → Game Management
2. Select "Create Game" tab
3. Choose a Saturday in Nov/Dec
4. Choose a time slot
5. Choose an available field
6. Optionally select home/away teams
7. Enter scores
8. Select game type
9. Click "Create Game"

### Editing a Game

1. Navigate to "View Games" tab
2. Click edit icon on any game
3. Modify any fields
4. Click "Update Game"

### Preventing Duplicates

- The UI automatically disables field/time combinations that are already taken
- Backend validates and returns clear error if duplicate attempted
- Edit mode excludes the current game from duplicate checking

## Files Modified/Created

### Backend

- ✅ `/Functions/src/functions/admin/createGame.ts` (new)
- ✅ `/Functions/src/functions/admin/updateGame.ts` (new)
- ✅ `/Functions/src/index.ts` (updated exports)

### Frontend

- ✅ `/App/src/firebase/collections/functions.ts` (added wrappers)
- ✅ `/App/src/features/admin/game-management.tsx` (new)
- ✅ `/App/src/features/admin/index.ts` (updated exports)
- ✅ `/App/src/features/admin/admin-dashboard.tsx` (added card)
- ✅ `/App/src/routes/route-components.ts` (added lazy import)
- ✅ `/App/src/routes/app-routes.tsx` (added route)

## Testing Recommendations

1. **Create Game:**
   - Try creating a game on a non-Saturday (should fail)
   - Try creating a game in January (should fail)
   - Try creating a game at 5:00pm (should fail)
   - Try creating duplicate game (should fail)
   - Create valid game (should succeed)

2. **Update Game:**
   - Update scores only
   - Update teams only
   - Update time/field to available slot
   - Update time/field to taken slot (should fail)
   - Set teams to TBD (null)

3. **UI:**
   - Verify field dropdown disables taken slots
   - Verify edit mode loads data correctly
   - Verify cancel button resets form
   - Verify view tab shows all games
   - Test on mobile/tablet screen sizes

4. **Access Control:**
   - Try accessing as non-admin user (should be blocked)
   - Verify admin can access all features

## Notes

- Games support nullable team references for placeholder/TBD games
- All operations are logged for audit trail
- The UI dynamically calculates available slots based on existing games
- Edit mode properly excludes the current game from duplicate checking
- The system uses Firebase Timestamps for consistent date/time handling
- All dates/times are in Central Time (CT) as specified in business requirements

### Daylight Saving Time (DST) Handling

The system correctly handles the DST transition that occurs in November:

**How it works:**

1. **Frontend (UI):** Creates timestamps using the user's local browser time, which automatically handles DST
2. **Backend (Functions):** Validates using `Date.getHours()` and `getDay()` which preserve the local time from the ISO 8601 timestamp
3. **Storage:** Firestore Timestamps store the absolute UTC time, so games scheduled for "6:00 PM CT" remain at 6:00 PM CT regardless of DST

**Example scenario:**

- **November 2, 2024 (DST active):** 6:00 PM CDT = 23:00 UTC
- **November 9, 2024 (after DST ends):** 6:00 PM CST = 00:00 UTC (next day)
- Both games display as "6:00 PM" to users in Central Time
- Both games are validated as 18:00 (6 PM) by the backend
- No special DST handling code required - JavaScript handles it naturally

**Why this works:**

- The ISO 8601 timestamp format includes timezone offset information
- When the frontend creates `new Date(selectedDate)` and sets the time, the browser uses its local timezone (CT for users in Central Time)
- The backend's `new Date(timestamp)` parses the ISO string with its timezone info preserved
- `gameDate.getHours()` returns the local hour (18 for 6 PM) regardless of whether it's CST or CDT

**Validation logging:**
Each game creation/update logs the `utcOffset` to help debug any timezone-related issues:

```javascript
{
  localHours: 18,
  timeString: "18:00",
  utcOffset: -360 (CST) or -300 (CDT)
}
```

This approach ensures that users always see and schedule games at their intended local time (6:00 PM, 6:45 PM, etc.) without needing to think about DST transitions.
