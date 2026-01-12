import { lazyImport } from '@/shared/utils'

/**
 * Centralized registry of all lazy-loaded route components
 *
 * This keeps all component imports in one place, making it easier to:
 * - Track which components are being lazy-loaded
 * - Update import paths consistently
 * - Analyze bundle splitting
 *
 * Organization:
 * - Public routes: features/public/* (accessible without authentication)
 * - Player routes: features/player/* (require authentication)
 * - Admin routes: features/admin/* (require authentication + admin role)
 */

// ==================== PUBLIC ROUTES ====================
// Accessible without authentication

export const Home = lazyImport(() => import('@/features/public/home'), 'Home')
export const Schedule = lazyImport(
	() => import('@/features/public/schedule'),
	'Schedule'
)
export const Standings = lazyImport(
	() => import('@/features/public/standings'),
	'Standings'
)
export const Teams = lazyImport(
	() => import('@/features/public/teams'),
	'Teams'
)
export const TeamProfile = lazyImport(
	() => import('@/features/public/teams'),
	'TeamProfile'
)
export const PlayerRankings = lazyImport(
	() => import('@/features/public/rankings'),
	'PlayerRankings'
)
export const PlayerRankingHistory = lazyImport(
	() => import('@/features/public/rankings'),
	'PlayerRankingHistory'
)
export const News = lazyImport(() => import('@/features/public/news'), 'News')
export const Posts = lazyImport(
	() => import('@/features/public/posts'),
	'Posts'
)

// ==================== PLAYER ROUTES ====================
// Require authentication

export const Profile = lazyImport(
	() => import('@/features/player/profile'),
	'Profile'
)
export const ManageTeam = lazyImport(
	() => import('@/features/player/team'),
	'ManageTeam'
)

// ==================== ADMIN ROUTES ====================
// Require authentication + admin role

export const AdminDashboard = lazyImport(
	() => import('@/features/admin/dashboard'),
	'AdminDashboard'
)
export const BadgeManagement = lazyImport(
	() => import('@/features/admin/badge-management'),
	'BadgeManagement'
)
export const GameManagement = lazyImport(
	() => import('@/features/admin/game-management'),
	'GameManagement'
)
export const OfferManagement = lazyImport(
	() => import('@/features/admin/offer-management'),
	'OfferManagement'
)
export const NewsManagement = lazyImport(
	() => import('@/features/admin/news-management'),
	'NewsManagement'
)
export const PlayerManagement = lazyImport(
	() => import('@/features/admin/player-management'),
	'PlayerManagement'
)
export const PlayerRankingManagement = lazyImport(
	() => import('@/features/admin/player-ranking-management'),
	'PlayerRankingManagement'
)
export const RegistrationManagement = lazyImport(
	() => import('@/features/admin/registration-management'),
	'RegistrationManagement'
)
export const SeasonManagement = lazyImport(
	() => import('@/features/admin/season-management'),
	'SeasonManagement'
)
export const TeamManagement = lazyImport(
	() => import('@/features/admin/team-management'),
	'TeamManagement'
)
export const SiteSettings = lazyImport(
	() => import('@/features/admin/site-settings'),
	'SiteSettings'
)
export const PostsManagement = lazyImport(
	() => import('@/features/admin/posts-management'),
	'PostsManagement'
)

// ==================== ERROR PAGES ====================

export const NotFound = lazyImport(
	() => import('@/features/not-found'),
	'NotFound'
)
