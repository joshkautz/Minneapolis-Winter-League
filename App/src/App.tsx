import { Routes, Route } from 'react-router-dom'
import { FourOhFour } from '@/components/four-oh-four'
import { Home } from '@/components/home'
import { Layout } from '@/components/layout'
import { Schedule } from '@/components/schedule'
import { Standings } from '@/components/standings'
import { Teams } from '@/components/teams'
import { ProtectedRoute } from '@/components/protected-route'
import { Profile } from '@/components/profile'
import { TeamProfile } from './components/team-profile'
import { ManageTeam } from './components/manage-team'
import { useContext, useEffect } from 'react'
import { AuthContext } from './firebase/auth-context'

function App() {
	const { authStateUser } = useContext(AuthContext)

	useEffect(() => {
		const interval = setInterval(() => {
			if (!authStateUser?.emailVerified) {
				authStateUser?.reload().then(() => {
					if (authStateUser.emailVerified) {
						authStateUser.getIdToken(true)
						// We've forced a refresh, so now we can clear the interval.
						clearInterval(interval)
					}
				})
			}
		}, 2000)

		// If the user is already verified, clear the interval.
		if (authStateUser?.emailVerified) {
			clearInterval(interval)
		}

		// If the component unmounts or useEffect is called again, clear the interval.
		return () => {
			clearInterval(interval)
		}
	}, [authStateUser?.emailVerified])

	return (
		<Routes>
			<Route path={'/'} element={<Layout />}>
				<Route index element={<Home />} />
				<Route path={'/schedule'} element={<Schedule />} />
				<Route path={'/standings'} element={<Standings />} />
				<Route path={'/team'} element={<TeamProfile />} />
				<Route path={'/teams'} element={<Teams />} />
				<Route path={'/teams/:id'} element={<TeamProfile />} />
				<Route
					path={'/profile'}
					element={
						<ProtectedRoute>
							<Profile />
						</ProtectedRoute>
					}
				/>
				{/* <Route
					path={'/create'}
					element={
						<ProtectedRoute>
							<CreateTeam />
						</ProtectedRoute>
					}
				/> */}
				<Route
					path={'/manage'}
					element={
						<ProtectedRoute>
							<ManageTeam />
						</ProtectedRoute>
					}
				/>
			</Route>
			<Route path={'*'} element={<FourOhFour />} />
		</Routes>
	)
}

export default App
