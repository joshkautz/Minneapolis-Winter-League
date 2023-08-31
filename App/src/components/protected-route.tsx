import { AuthContext } from '@/firebase/auth-context'
import { PropsWithChildren, useContext } from 'react'
import { Navigate } from 'react-router-dom'

export const ProtectedRoute: React.FC<PropsWithChildren> = ({ children }) => {
	const { authStateUser } = useContext(AuthContext)

	if (!authStateUser) {
		return <Navigate to={'/'} />
	}
	return children
}
