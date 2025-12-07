import { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '@/providers'
import { LoadingSpinner } from '@/shared/components'

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
	const { authStateUser, authStateLoading } = useAuthContext()

	if (authStateLoading) {
		return (
			<div className='ring-3 h-[calc(100vh-60px)] w-full items-center justify-center flex'>
				<LoadingSpinner size='lg' />
			</div>
		)
	}

	if (!authStateUser) {
		return <Navigate to={'/'} />
	}

	return children
}
