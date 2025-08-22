import { useAuthContext } from '@/providers'
import { ReloadIcon } from '@radix-ui/react-icons'
import { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'

export const ProtectedRoute: React.FC<PropsWithChildren> = ({ children }) => {
	const { authStateUser, authStateLoading } = useAuthContext()

	if (authStateLoading) {
		return (
			<div className="ring-3 h-[calc(100vh-60px)] w-full items-center justify-center flex">
				<ReloadIcon className={'h-10 w-10 animate-spin'} />
			</div>
		)
	}

	if (!authStateUser) {
		return <Navigate to={'/'} />
	}

	return children
}
