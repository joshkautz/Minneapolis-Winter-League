# News Feature Documentation

## Overview

The News feature provides a beautiful, accessible news feed where admin users can broadcast public messages to keep league participants up-to-date with announcements, updates, and important information.

## Feature Capabilities

### Public Access

- **All users** (authenticated and non-authenticated) can view published news posts
- Posts are displayed newest first with infinite scroll
- Posts are filtered by the currently selected season
- Beautiful, responsive card-based layout using shadcn/ui components

### Admin Access

- **Admin users only** can create, edit, and delete news posts (admin UI to be built)
- Draft/published status control
- Author attribution automatically tracked

## Technical Implementation

### 1. Firestore Collection: `news`

#### Document Structure

```typescript
interface NewsDocument {
	title: string // Post title
	content: string // Post body (plain text, preserves whitespace)
	author: DocumentReference<PlayerDocument> // Admin who created the post
	season: DocumentReference<SeasonDocument> // Associated season
	createdAt: Timestamp // Creation timestamp
	updatedAt: Timestamp // Last update timestamp
	published: boolean // Publication status
}
```

#### Firestore Index

A composite index is required for efficient querying:

- Fields: `season` (ASC), `published` (ASC), `createdAt` (DESC)
- This index is defined in `firestore.indexes.json`

#### Security Rules

```
match /news/{newsId} {
  allow read: if true; // Public read access
  allow create: if false; // Use createNewsViaFunction (future)
  allow update: if false; // Use updateNewsViaFunction (future)
  allow delete: if false; // Use deleteNewsViaFunction (future)
}
```

### 2. Frontend Components

#### Files Created

```
App/src/features/news/
├── index.ts                 # Barrel export
├── news.tsx                 # Main news page with infinite scroll
├── news-card.tsx            # Individual news post card
└── news-empty-state.tsx     # Empty state component
```

#### Key Features

**News Page (`news.tsx`)**

- Infinite scroll using Intersection Observer API
- Loads 10 posts per page
- Automatic pagination as user scrolls
- Loading states and error handling
- Season-aware filtering

**News Card (`news-card.tsx`)**

- Beautiful card layout with shadcn/ui
- Author information with automatic fetching
- Relative timestamps using `date-fns`
- "Edited" badge when post has been updated
- Responsive design with proper whitespace handling
- Semantic HTML with accessibility attributes

**News Empty State (`news-empty-state.tsx`)**

- Friendly message when no posts exist
- Consistent with other empty states in the app

### 3. Firestore Operations

#### File: `App/src/firebase/collections/news.ts`

**Available Functions:**

1. **`newsQueryBySeason(seasonRef, pageSize?, lastDoc?)`**
   - Returns published news posts for a specific season
   - Supports pagination via `lastDoc` parameter
   - Default page size: 10 posts
   - Ordered by creation date (newest first)

2. **`allNewsQueryBySeason(seasonRef)`**
   - Returns ALL news posts (including drafts) for a season
   - For admin views (future use)
   - Ordered by creation date (newest first)

### 4. Navigation Integration

#### Files Modified

- `App/src/shared/hooks/use-top-navigation.ts` - Added "News" to nav content
- `App/src/routes/app-routes.tsx` - Added `/news` public route
- `App/src/routes/route-components.ts` - Added lazy-loaded News component

**Navigation Link:**

```typescript
{ label: 'News', path: '/news', alt: 'league news and announcements' }
```

### 5. Type Definitions

Added to `App/src/types.ts`:

- `Collections.NEWS` enum value
- `NewsDocument` interface with full type safety

## User Experience

### Design Principles

- **Responsive**: Works beautifully on all screen sizes
- **Accessible**: Semantic HTML, ARIA labels, keyboard navigation
- **Performance**: Lazy loading with infinite scroll
- **Visual Hierarchy**: Clear typography and spacing
- **Consistency**: Uses established shadcn/ui component patterns

### Visual Design

- Card-based layout with hover effects
- Clear visual separation between posts
- Author and timestamp metadata
- "Edited" badge for transparency
- Professional, clean aesthetic

### Accessibility Features

- Semantic HTML structure
- Proper heading hierarchy
- ARIA labels for icons
- Keyboard navigable
- Screen reader friendly
- ISO datetime attributes for timestamps

## Future Enhancements

### Admin Management Page (Planned)

Following the established pattern from other admin pages:

- Location: `/admin/news-management`
- Create new posts with title and content
- Edit existing posts
- Delete posts
- Toggle draft/published status
- Rich text editor (optional future enhancement)

### Firebase Functions (Planned)

Create secure server-side functions for:

- `createNewsViaFunction` - Create new news posts
- `updateNewsViaFunction` - Edit existing posts
- `deleteNewsViaFunction` - Delete posts
- Admin-only authorization checks

### Additional Features (Future Consideration)

- Notification badge for new posts since last visit
- Post categories/tags
- Search functionality
- Comments/reactions
- Email notifications for important announcements
- Rich media support (while current spec excludes files, could add embeds)

## Migration Notes

### Deployment Checklist

1. ✅ Deploy Firestore index from `firestore.indexes.json`
2. ✅ Deploy Firestore rules from `firestore.rules`
3. ✅ Deploy frontend code
4. ⏳ Create Firebase Functions for admin operations (future)
5. ⏳ Build admin management UI (future)

### Creating Test Data

Since admin functions don't exist yet, test data can be manually created in Firebase Console:

```javascript
{
  title: "Welcome to the Winter League!",
  content: "We're excited to announce the start of the season...",
  author: <reference to admin player doc>,
  season: <reference to current season doc>,
  createdAt: <Firebase Timestamp>,
  updatedAt: <Firebase Timestamp>,
  published: true
}
```

## Performance Considerations

- **Infinite Scroll**: Only loads 10 posts at a time
- **Lazy Loading**: News component is code-split
- **Author Caching**: Could be optimized by denormalizing author name into news doc
- **Query Optimization**: Composite index ensures fast queries

## Security Considerations

- All write operations will be handled by Firebase Functions (future)
- Firestore rules prevent direct client writes
- Admin authorization will be enforced server-side
- Public read access is intentional and safe

## Best Practices Followed

✅ Type safety with TypeScript
✅ Component composition and separation of concerns
✅ Error boundaries for graceful error handling
✅ Loading states for better UX
✅ Semantic HTML and accessibility
✅ Responsive design
✅ Code splitting and lazy loading
✅ Consistent with existing app patterns
✅ Comprehensive documentation
✅ Security-first approach

## Questions or Issues?

For questions about implementation or to report issues with the News feature, please contact the development team.
