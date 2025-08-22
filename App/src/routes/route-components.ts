import { lazyImport } from '@/utils/lazy-import'

/**
 * Centralized registry of all lazy-loaded route components
 * 
 * This keeps all component imports in one place, making it easier to:
 * - Track which components are being lazy-loaded
 * - Update import paths consistently
 * - Analyze bundle splitting
 */

// Public routes - accessible without authentication
export const Home = lazyImport(() => import('@/components/home/home'), 'Home')
export const Schedule = lazyImport(
	() => import('@/components/schedule/schedule'),
	'Schedule'
)
export const Standings = lazyImport(
	() => import('@/components/standings/standings'),
	'Standings'
)
export const Teams = lazyImport(() => import('@/components/teams/teams'), 'Teams')
export const TeamProfile = lazyImport(
	() => import('@/components/team-profile/team-profile'),
	'TeamProfile'
)

// Protected routes - require authentication
export const Profile = lazyImport(() => import('@/components/profile'), 'Profile')
export const CreateTeam = lazyImport(
	() => import('@/components/create/create-team'),
	'CreateTeam'
)
export const ManageTeam = lazyImport(
	() => import('@/components/manage/manage-team'),
	'ManageTeam'
)

// Error pages
export const FourOhFour = lazyImport(
	() => import('@/components/four-oh-four'),
	'FourOhFour'
)
