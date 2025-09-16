import React from 'react'
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
	PlayerRankingsAdmin,
	AdminDashboard,
	Profile,
	CreateTeam,
	ManageTeam,
	FourOhFour,
} from './route-components'

/**
 * Application route configuration
 *
 * Centralized route definitions with clear separation between:
 * - Public routes (accessible to all users)
 * - Protected routes (require authentication)
 * - Error routes (404, etc.)
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
					path='/player-rankings'
					element={
						<PublicRoute>
							<PlayerRankings />
						</PublicRoute>
					}
				/>
				<Route
					path='/player-rankings/player/:playerId'
					element={
						<PublicRoute>
							<PlayerRankingHistory />
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
					path='/create'
					element={
						<AuthenticatedRoute>
							<CreateTeam />
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
					path='/admin'
					element={
						<AuthenticatedRoute>
							<AdminDashboard />
						</AuthenticatedRoute>
					}
				/>
				<Route
					path='/admin/player-rankings'
					element={
						<AuthenticatedRoute>
							<PlayerRankingsAdmin />
						</AuthenticatedRoute>
					}
				/>
			</Route>

			{/* Error routes */}
			<Route
				path='*'
				element={
					<PublicRoute>
						<FourOhFour />
					</PublicRoute>
				}
			/>
		</Routes>
	)
}
