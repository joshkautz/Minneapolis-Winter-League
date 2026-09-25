import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/shared/components'
import { PublicRoute, AuthenticatedRoute } from './route-wrappers'
import {
	Home,
	Schedule,
	Standings,
	Teams,
	TeamProfile,
	PlayerRankings,
	PlayerRankingHistory,
	PlayerRankingManagement,
	News,
	Posts,
	AdminDashboard,
	PlayerManagement,
	OfferManagement,
	TeamManagement,
	NewsManagement,
	PostsManagement,
	SeasonManagement,
	SwissRankings,
	GameManagement,
	RegistrationManagement,
	BadgeManagement,
	SiteSettings,
	Profile,
	ManageTeam,
	Waiver,
	WaiverCopy,
	NotFound,
} from './route-components'

/**
 * Application route configuration
 *
 * Centralized route definitions with clear separation between:
 * - Public routes (accessible to all users)
 * - Protected routes (require authentication)
 * - Error routes (404, etc.)
 *
 * Every route renders through `PublicRoute` or `AuthenticatedRoute`, which
 * lazy-load it inside its own error boundary: a page that throws, or whose
 * chunk fails to load, shows an error card while the navigation still works.
 */
export const AppRoutes = () => {
	return (
		<Routes>
			{/* Main layout routes */}
			<Route path='/' element={<Layout />}>
				{/* Public routes */}
				<Route
					index
					element={
						<PublicRoute>
							<Home />
						</PublicRoute>
					}
				/>
				<Route
					path='/schedule'
					element={
						<PublicRoute>
							<Schedule />
						</PublicRoute>
					}
				/>
				<Route
					path='/standings'
					element={
						<PublicRoute>
							<Standings />
						</PublicRoute>
					}
				/>
				<Route
					path='/teams'
					element={
						<PublicRoute>
							<Teams />
						</PublicRoute>
					}
				/>
				<Route
					path='/teams/:id'
					element={
						<PublicRoute>
							<TeamProfile />
						</PublicRoute>
					}
				/>
				<Route
					path='/teams/:id/:seasonId'
					element={
						<PublicRoute>
							<TeamProfile />
						</PublicRoute>
					}
				/>
				<Route
					path='/players'
					element={
						<PublicRoute>
							<PlayerRankings />
						</PublicRoute>
					}
				/>
				<Route
					path='/players/:playerId'
					element={
						<PublicRoute>
							<PlayerRankingHistory />
						</PublicRoute>
					}
				/>
				<Route
					path='/news'
					element={
						<PublicRoute>
							<News />
						</PublicRoute>
					}
				/>
				<Route
					path='/posts'
					element={
						<PublicRoute>
							<Posts />
						</PublicRoute>
					}
				/>
				{/* Protected routes */}
				<Route
					path='/profile'
					element={
						<AuthenticatedRoute>
							<Profile />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/manage'
					element={
						<AuthenticatedRoute>
							<ManageTeam />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/waiver'
					element={
						<AuthenticatedRoute>
							<Waiver />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/waiver/copy/:playerId/:signatureId'
					element={
						<AuthenticatedRoute>
							<WaiverCopy />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin'
					element={
						<AuthenticatedRoute>
							<AdminDashboard />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/player-management'
					element={
						<AuthenticatedRoute>
							<PlayerManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/offer-management'
					element={
						<AuthenticatedRoute>
							<OfferManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/team-management'
					element={
						<AuthenticatedRoute>
							<TeamManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/news-management'
					element={
						<AuthenticatedRoute>
							<NewsManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/posts-management'
					element={
						<AuthenticatedRoute>
							<PostsManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/season-management'
					element={
						<AuthenticatedRoute>
							<SeasonManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/swiss-rankings'
					element={
						<AuthenticatedRoute>
							<SwissRankings />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/game-management'
					element={
						<AuthenticatedRoute>
							<GameManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/rankings-management'
					element={
						<AuthenticatedRoute>
							<PlayerRankingManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/registration-management'
					element={
						<AuthenticatedRoute>
							<RegistrationManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/badge-management'
					element={
						<AuthenticatedRoute>
							<BadgeManagement />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/site-settings'
					element={
						<AuthenticatedRoute>
							<SiteSettings />
						</AuthenticatedRoute>
					}
				/>
				{/* Error routes */}
				<Route
					path='*'
					element={
						<PublicRoute>
							<NotFound />
						</PublicRoute>
					}
				/>
			</Route>
		</Routes>
	)
}
