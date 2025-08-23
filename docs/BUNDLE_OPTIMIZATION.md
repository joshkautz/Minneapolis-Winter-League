# Bundle Optimization Documentation

## Overview

This document explains the bundle optimization strategy implemented to reduce initial bundle size and improve application performance.

## Problem

The original build produced a single large chunk (1,473 kB) that caused:

- Slow initial page loads
- Poor caching efficiency (entire bundle invalidated on any change)
- Large amounts of unused code loaded upfront

## Solution

### 1. Manual Chunk Splitting (`vite.config.ts`)

Strategically split vendor libraries into separate chunks:

- **react-vendor**: React, React DOM, React Router (~200kB)
- **firebase**: Firebase SDK and related libraries (~800kB)
- **radix-ui**: Radix UI component library (~150kB)
- **forms**: React Hook Form, Zod validation (~100kB)
- **vendor**: Other third-party libraries

**Benefits:**

- Better browser caching (vendor chunks change infrequently)
- Parallel downloads of chunks
- Only changed chunks need re-download on updates

### 2. Route-Based Code Splitting (`App.tsx`)

Implemented lazy loading for route components:

```tsx
// Before: All components loaded upfront
import Home from '@/components/home/home'
import Schedule from '@/components/schedule/schedule'

// After: Components loaded on-demand
const Home = lazyImport(() => import('@/components/home/home'), 'Home')
const Schedule = lazyImport(
	() => import('@/components/schedule/schedule'),
	'Schedule'
)
```

**Benefits:**

- Reduces initial bundle size
- Components load only when routes are accessed
- Better perceived performance

### 3. Consistent Loading UI (`LazyWrapper`)

Created reusable wrapper to eliminate Suspense boilerplate:

```tsx
// Before: Repetitive Suspense in every route
<Route path="/schedule" element={
  <Suspense fallback={<LoadingSpinner />}>
    <Schedule />
  </Suspense>
} />

// After: Clean and consistent
<Route path="/schedule" element={
  <LazyWrapper><Schedule /></LazyWrapper>
} />
```

## Results

### Bundle Size Reduction

- **Before**: Single chunk of 1,473 kB
- **After**: Multiple optimized chunks:
  - Main app chunk: ~200kB
  - React vendor: ~200kB
  - Firebase: ~800kB
  - Other chunks: ~100-150kB each

### Performance Improvements

- **Initial Load**: Faster due to smaller main chunk
- **Caching**: Better efficiency with separated vendor chunks
- **Updates**: Only changed chunks need re-download
- **Perceived Performance**: Routes load on-demand with smooth loading states

## Configuration Files

### `vite.config.ts`

- Manual chunk splitting strategy
- Increased chunk size warning limit to 600kB
- Vendor library categorization

### `App.tsx`

- Route-based lazy loading
- Helper function for named exports
- LazyWrapper integration

### `components/lazy-wrapper.tsx`

- Reusable Suspense wrapper
- Consistent loading UI
- Reduces code duplication

## Best Practices

1. **Keep vendor chunks stable** - Group libraries that change together
2. **Monitor chunk sizes** - Keep individual chunks under 600kB when possible
3. **Use meaningful chunk names** - Makes debugging and analysis easier
4. **Lazy load routes** - Don't load components until they're needed
5. **Consistent loading states** - Use LazyWrapper for uniform UX

## Monitoring

Use these commands to analyze bundle performance:

```bash
# Build and analyze bundle
npm run build

# Preview production build
npm run preview

# Analyze bundle composition (if analyzer is installed)
npx vite-bundle-analyzer dist
```

## Future Optimizations

- Consider lazy loading large components within routes
- Implement service worker for better caching strategies
- Monitor Core Web Vitals for performance regressions
- Consider preloading critical route chunks
