import { Outlet, useLocation } from 'react-router-dom'
import { NavigationBar } from './navigation-bar'
import { AuthModal } from '@/features/auth'
import { useAuthModal } from '@/features/auth'
import { cn } from '@/shared/utils'

export type OutletContext = {
	openAuthModal: () => void
}

export const Layout = () => {
	const { pathname } = useLocation()
	const { isAuthModalOpen, openAuthModal, closeAuthModal } = useAuthModal()

	return (
		<div
			className={cn(
				'flex flex-col items-center justify-start min-h-screen',
				pathname !== '/' && 'pb-10'
			)}
		>
			<NavigationBar onLoginClick={openAuthModal} />
			<Outlet context={{ openAuthModal } satisfies OutletContext} />
			<AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
		</div>
	)
}
