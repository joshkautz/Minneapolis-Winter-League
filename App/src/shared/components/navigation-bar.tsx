import { DesktopNavigation, MobileNavigation } from './navigation'
import { useTopNavigation } from '@/shared/hooks'

interface NavigationBarProps {
	onLoginClick: () => void
}

/**
 * Top navigation bar component that handles responsive navigation
 * Shows DesktopNavigation on larger screens and MobileNavigation with sheet on mobile
 */
export const NavigationBar = ({ onLoginClick }: NavigationBarProps) => {
	const {
		authStateUser,
		authStateLoading,
		signOutLoading,
		isMobileNavOpen,
		hasPendingOffers,
		hasRequiredTasks,
		navContent,
		userContent,
		setIsMobileNavOpen,
		handleCloseMobileNav,
		handleSignOut,
		handleMobileLogin,
	} = useTopNavigation()

	return (
		<header className='sticky top-0 z-50 w-full border-b supports-backdrop-blur:bg-background/60 bg-background/95 backdrop-blur-sm'>
			<div className='container flex items-center h-14'>
				{/* Desktop Navigation */}
				<DesktopNavigation
					navItems={navContent}
					userItems={userContent}
					onLoginClick={onLoginClick}
				/>

				{/* Mobile Navigation */}
				<MobileNavigation
					navItems={navContent}
					userItems={userContent}
					isAuthenticated={!!authStateUser}
					hasPendingOffers={hasPendingOffers}
					hasRequiredTasks={hasRequiredTasks}
					isMobileNavOpen={isMobileNavOpen}
					setIsMobileNavOpen={setIsMobileNavOpen}
					onItemClick={handleCloseMobileNav}
					onSignOut={handleSignOut}
					onLogin={() => handleMobileLogin(onLoginClick)}
					signOutLoading={signOutLoading}
					authStateLoading={authStateLoading}
				/>
			</div>
		</header>
	)
}
