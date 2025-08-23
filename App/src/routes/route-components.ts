import { lazyImport } from '@/shared/utils'

/**
 * Centralized registry of all lazy-loaded route components
 *
 * This keeps all component imports in one place, making it easier to:
 * - Track which components are being lazy-loaded
 * - Update import paths consistently
 * - Analyze bundle splitting
 */

// Public routes - accessible without authentication
export const Home = lazyImport(() => import('@/features/home'), 'Home')
export const Schedule = lazyImport(
	() => import('@/features/schedule'),
	'Schedule'
)
export const Standings = lazyImport(
	() => import('@/features/standings'),
	'Standings'
)
export const Teams = lazyImport(() => import('@/features/teams'), 'Teams')
export const TeamProfile = lazyImport(
	() => import('@/features/teams'),
	'TeamProfile'
)

// Protected routes - require authentication
export const Profile = lazyImport(() => import('@/features/profile'), 'Profile')
export const CreateTeam = lazyImport(
	() => import('@/features/create/create-team'),
	'CreateTeam'
)
export const ManageTeam = lazyImport(
	() => import('@/features/manage'),
	'ManageTeam'
)

// Error pages
export const FourOhFour = lazyImport(() => import('@/pages'), 'FourOhFour')
