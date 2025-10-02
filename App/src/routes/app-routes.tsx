import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/shared/components'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { PublicRoute, AuthenticatedRoute } from './route-wrappers'
import {
	Home,
	Schedule,
	Standings,
	Teams,
	TeamProfile,
	PlayerRankings,
	PlayerRankingHistory,
	PlayerRankingsAdmin,
	AdminDashboard,
	UserManagement,
	WaiverStatus,
	EmailVerification,
	PlayerRegistrationStatus,
	PendingOffers,
	Profile,
	ManageTeam,
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
 * Error Boundaries: Critical routes are wrapped with ErrorBoundary components
 * to provide graceful error handling. The ErrorBoundary component automatically
 * logs errors with route context, so no additional onError props are needed.
 *
 * For route-specific error handling, consider using RouteErrorBoundary instead.
 */
export const AppRoutes: React.FC = () => {
	return (
		<Routes>
			{/* Main layout routes */}
			<Route path='/' element={<Layout />}>
				{/* Public routes */}
				<Route
					index
					element={
						<PublicRoute>
							<ErrorBoundary>
								<Home />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/schedule'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<Schedule />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/standings'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<Standings />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/teams'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<Teams />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/teams/:id'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<TeamProfile />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/player-rankings'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<PlayerRankings />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				<Route
					path='/player-rankings/player/:playerId'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<PlayerRankingHistory />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
				{/* Protected routes */}
				<Route
					path='/profile'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<Profile />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/manage'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<ManageTeam />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<AdminDashboard />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/user-management'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<UserManagement />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/waiver-status'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<WaiverStatus />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/email-verification'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<EmailVerification />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/player-registration-status'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<PlayerRegistrationStatus />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/pending-offers'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<PendingOffers />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/player-rankings'
					element={
						<AuthenticatedRoute>
							<ErrorBoundary>
								<PlayerRankingsAdmin />
							</ErrorBoundary>
						</AuthenticatedRoute>
					}
				/>{' '}
				{/* Error routes */}
				<Route
					path='*'
					element={
						<PublicRoute>
							<ErrorBoundary>
								<NotFound />
							</ErrorBoundary>
						</PublicRoute>
					}
				/>
			</Route>
		</Routes>
	)
}
