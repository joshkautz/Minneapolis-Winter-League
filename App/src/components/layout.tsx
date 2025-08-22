import { Outlet, useLocation } from 'react-router-dom'
import { TopNav } from '@/components/top-nav'
import { AuthModal } from '@/components/auth'
import { useAuthModal } from '@/components/auth/use-auth-modal'
import { cn } from '@/lib/utils'

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
			<TopNav onLoginClick={openAuthModal} />
			<Outlet context={{ openAuthModal } satisfies OutletContext} />
			<AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
		</div>
	)
}
