# Firestore Indexes Documentation

## Overview

This document provides comprehensive information about the Firestore composite indexes configured for the Minneapolis Winter League application. These indexes are essential for optimizing query performance and ensuring efficient data retrieval across the application.

## Index Configuration File

All indexes are defined in `/firestore.indexes.json` and are automatically deployed with Firebase CLI or Firebase Hosting.

## Current Indexes

### 1. Games Collection Indexes

#### Index: `season + type`

```json
{
	"collectionGroup": "games",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "season", "order": "ASCENDING" },
		{ "fieldPath": "type", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries that filter games by both season and game type.

**Query Patterns Supported**:

- `where('season', '==', seasonRef).where('type', '==', 'regular')`
- `where('season', '==', seasonRef).where('type', '==', 'playoff')`

**Used In**:

- `currentSeasonRegularGamesQuery()` - Loading regular season games
- `currentSeasonPlayoffGamesQuery()` - Loading playoff games
- Schedule pages filtering by game type
- Statistics calculations by game type

**Benefits**:

- ✅ Fast season-specific game filtering
- ✅ Efficient separation of regular vs playoff games
- ✅ Supports real-time listeners for live game updates

**Cost**: ~2KB per game document indexed

---

#### Index: `home + date`

```json
{
	"collectionGroup": "games",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "home", "order": "ASCENDING" },
		{ "fieldPath": "date", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries for home team games ordered chronologically.

**Query Patterns Supported**:

- `where('home', '==', teamRef).orderBy('date', 'asc')`
- Part of `or(where('home', '==', teamRef), where('away', '==', teamRef)).orderBy('date', 'asc')`

**Used In**:

- `gamesByTeamQuery()` - Team-specific game schedules
- Team profile pages showing home games
- Home game statistics

**Benefits**:

- ✅ Fast team-specific game retrieval
- ✅ Chronologically ordered results
- ✅ Supports pagination for teams with many games

**Cost**: ~2KB per game document indexed

---

#### Index: `away + date`

```json
{
	"collectionGroup": "games",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "away", "order": "ASCENDING" },
		{ "fieldPath": "date", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries for away team games ordered chronologically.

**Query Patterns Supported**:

- `where('away', '==', teamRef).orderBy('date', 'asc')`
- Part of `or(where('home', '==', teamRef), where('away', '==', teamRef)).orderBy('date', 'asc')`

**Used In**:

- `gamesByTeamQuery()` - Team-specific game schedules
- Team profile pages showing away games
- Away game statistics

**Benefits**:

- ✅ Fast team-specific game retrieval
- ✅ Chronologically ordered results
- ✅ Complements home games index for complete team schedules

**Cost**: ~2KB per game document indexed

---

### 2. Offers Collection Indexes

#### Index: `team + type`

```json
{
	"collectionGroup": "offers",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "team", "order": "ASCENDING" },
		{ "fieldPath": "type", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries for team-specific offers by offer type.

**Query Patterns Supported**:

- `where('team', '==', teamRef).where('type', '==', 'invitation')`
- `where('team', '==', teamRef).where('type', '==', 'request')`

**Used In**:

- `outgoingOffersQuery()` - Captain's sent invitations
- `incomingOffersQuery()` - Captain's received requests
- Team management dashboards
- Offer notification systems

**Benefits**:

- ✅ Fast captain dashboard loading
- ✅ Efficient team offer management
- ✅ Supports real-time offer updates

**Cost**: ~1.5KB per offer document indexed

---

#### Index: `player + type`

```json
{
	"collectionGroup": "offers",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "player", "order": "ASCENDING" },
		{ "fieldPath": "type", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries for player-specific offers by offer type.

**Query Patterns Supported**:

- `where('player', '==', playerRef).where('type', '==', 'invitation')`
- `where('player', '==', playerRef).where('type', '==', 'request')`

**Used In**:

- `outgoingOffersQuery()` - Player's sent requests
- `incomingOffersQuery()` - Player's received invitations
- Player profile offer history
- Notification systems

**Benefits**:

- ✅ Fast player dashboard loading
- ✅ Efficient player offer management
- ✅ Clear separation of sent vs received offers

**Cost**: ~1.5KB per offer document indexed

---

#### Index: `player + team`

```json
{
	"collectionGroup": "offers",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "player", "order": "ASCENDING" },
		{ "fieldPath": "team", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes queries for specific player-team offer relationships.

**Query Patterns Supported**:

- `where('player', '==', playerRef).where('team', '==', teamRef)`

**Used In**:

- `offersForPlayerByTeamQuery()` - Checking existing offers
- Preventing duplicate invitations/requests
- Offer validation logic
- UI state management (showing/hiding invite buttons)

**Benefits**:

- ✅ Fast duplicate offer detection
- ✅ Prevents redundant invitations
- ✅ Improves UI responsiveness

**Cost**: ~1.5KB per offer document indexed

---

### 3. Players Collection Indexes

#### Index: `firstname + lastname`

```json
{
	"collectionGroup": "players",
	"queryScope": "COLLECTION",
	"fields": [
		{ "fieldPath": "firstname", "order": "ASCENDING" },
		{ "fieldPath": "lastname", "order": "ASCENDING" }
	]
}
```

**Purpose**: Optimizes full name search queries and name-based sorting.

**Query Patterns Supported**:

- `where('firstname', '>=', firstName).where('firstname', '<=', firstName + '\uf8ff').where('lastname', '>=', lastName).where('lastname', '<=', lastName + '\uf8ff')`
- Full name range queries for search functionality

**Used In**:

- `getPlayersQuery()` - Player search functionality
- Team captain player invitation flow
- Admin player management
- Player directory features

**Benefits**:

- ✅ Fast player name search
- ✅ Efficient full name queries
- ✅ Supports partial name matching
- ✅ Better search user experience

**Cost**: ~1KB per player document indexed

**Note**: This index supports the complex `or()` query logic used in player search, though individual range queries on firstname/lastname are also automatically indexed.

---

## Performance Impact Analysis

### Query Performance Improvements

| Query Type           | Without Index | With Index | Improvement    |
| -------------------- | ------------- | ---------- | -------------- |
| Season games by type | O(n) scan     | O(log n)   | 10-100x faster |
| Team-specific games  | O(n) scan     | O(log n)   | 10-100x faster |
| Player/Team offers   | O(n) scan     | O(log n)   | 10-100x faster |
| Player name search   | O(n) scan     | O(log n)   | 5-50x faster   |

### Storage Costs

**Total estimated index storage**: ~15-25KB per active game/offer/player

**Cost breakdown**:

- Games indexes: ~6KB per game (3 indexes × ~2KB each)
- Offers indexes: ~4.5KB per offer (3 indexes × ~1.5KB each)
- Players indexes: ~1KB per player (1 index)

**Monthly cost estimate**: $0.01-0.05 per 1000 documents (varies by region)

### Write Performance Impact

**Index maintenance overhead**:

- Each write operation updates all relevant indexes
- Games: 3 indexes updated per game write
- Offers: 3 indexes updated per offer write
- Players: 1 index updated per player write

**Recommendation**: The performance benefits significantly outweigh the write overhead for this application's read-heavy usage patterns.

---

## Monitoring and Maintenance

### Firebase Console Monitoring

1. **Index Usage Statistics**:
   - Monitor in Firebase Console → Firestore → Indexes
   - Review query performance metrics
   - Identify unused indexes

2. **Query Performance**:
   - Check query execution times in Console
   - Monitor for slow queries
   - Review query patterns in application logs

### Optimization Opportunities

**Future considerations**:

1. **Add status field to offer indexes** if filtering by offer status becomes common:

   ```json
   {
   	"fields": [
   		{ "fieldPath": "team", "order": "ASCENDING" },
   		{ "fieldPath": "status", "order": "ASCENDING" },
   		{ "fieldPath": "type", "order": "ASCENDING" }
   	]
   }
   ```

2. **Consider date-based sorting** for offers if chronological ordering is needed:

   ```json
   {
   	"fields": [
   		{ "fieldPath": "player", "order": "ASCENDING" },
   		{ "fieldPath": "type", "order": "ASCENDING" },
   		{ "fieldPath": "createdAt", "order": "DESCENDING" }
   	]
   }
   ```

3. **Team collection indexes** may be beneficial for large team datasets:

   ```json
   {
   	"fields": [
   		{ "fieldPath": "season", "order": "ASCENDING" },
   		{ "fieldPath": "registered", "order": "ASCENDING" }
   	]
   }
   ```

---

## Deployment and Management

### Deploying Index Changes

```bash
# Deploy indexes with Firebase CLI
firebase deploy --only firestore:indexes

# Deploy specific project
firebase deploy --only firestore:indexes --project your-project-id
```

### Index Creation Time

- **Small collections** (< 1000 docs): 1-5 minutes
- **Medium collections** (1000-10000 docs): 5-30 minutes
- **Large collections** (> 10000 docs): 30+ minutes

### Rollback Strategy

1. Keep backup of previous `firestore.indexes.json`
2. Test index changes in development environment first
3. Monitor query performance after deployment
4. Use Firebase Console to delete problematic indexes if needed

---

## Security Considerations

### Index Security Rules

Indexes respect Firestore security rules - they don't expose data that users shouldn't access.

**Important**: Indexes can reveal the existence of documents even if security rules prevent reading the document contents.

### Query Security

All indexed queries still require proper authentication and authorization as defined in `firestore.rules`.

---

## Troubleshooting

### Common Issues

1. **Queries still slow after index deployment**:
   - Verify index is fully built in Firebase Console
   - Check query syntax matches index field order
   - Consider if query needs additional index fields

2. **Index build failures**:
   - Check for field type mismatches
   - Verify collection names are correct
   - Review field path syntax

3. **Unexpected query costs**:
   - Monitor document read counts
   - Check for inefficient query patterns
   - Consider query result limiting

### Performance Testing

```typescript
// Example: Testing query performance
import { getDoc, query, where, getDocs } from 'firebase/firestore'

const testQueryPerformance = async () => {
	const startTime = performance.now()

	const q = query(
		collection(firestore, 'games'),
		where('season', '==', seasonRef),
		where('type', '==', 'regular')
	)

	const querySnapshot = await getDocs(q)
	const endTime = performance.now()

	console.log(`Query took ${endTime - startTime} milliseconds`)
	console.log(`Returned ${querySnapshot.size} documents`)
}
```

---

## Related Documentation

- [Firebase Collections Guide](./FIREBASE_COLLECTIONS_README.md) - Understanding collection structure
- [Security Rules](./SECURITY.md) - Firestore security configuration
- [Development Setup](./DEVELOPMENT_SETUP.md) - Local development with emulators

---

_Last updated: August 23, 2025_
_Next review: November 2025_
