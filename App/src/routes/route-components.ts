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
export const PlayerRankings = lazyImport(
	() => import('@/features/player-rankings'),
	'PlayerRankings'
)
export const PlayerRankingHistory = lazyImport(
	() => import('@/features/player-rankings'),
	'PlayerRankingHistory'
)
export const News = lazyImport(() => import('@/features/news'), 'News')
export const PlayerRankingsAdmin = lazyImport(
	() => import('@/features/admin'),
	'PlayerRankingsAdmin'
)
export const AdminDashboard = lazyImport(
	() => import('@/features/admin'),
	'AdminDashboard'
)
export const PlayerManagement = lazyImport(
	() => import('@/features/admin'),
	'PlayerManagement'
)
export const EmailVerification = lazyImport(
	() => import('@/features/admin'),
	'EmailVerification'
)
export const ManageOffers = lazyImport(
	() => import('@/features/admin'),
	'ManageOffers'
)
export const TeamsManagement = lazyImport(
	() => import('@/features/admin'),
	'TeamsManagement'
)
export const NewsManagement = lazyImport(
	() => import('@/features/admin'),
	'NewsManagement'
)
export const SeasonManagement = lazyImport(
	() => import('@/features/admin'),
	'SeasonManagement'
)
export const GameManagement = lazyImport(
	() => import('@/features/admin'),
	'GameManagement'
)
export const RegistrationManagement = lazyImport(
	() => import('@/features/admin'),
	'RegistrationManagement'
)
export const BadgeManagement = lazyImport(
	() => import('@/features/admin'),
	'BadgeManagement'
)

// Protected routes - require authentication
export const Profile = lazyImport(() => import('@/features/profile'), 'Profile')
export const ManageTeam = lazyImport(
	() => import('@/features/manage'),
	'ManageTeam'
)

// Error pages
export const NotFound = lazyImport(() => import('@/pages'), 'NotFound')
