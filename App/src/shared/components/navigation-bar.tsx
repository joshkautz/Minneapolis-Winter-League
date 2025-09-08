import { useState, useEffect } from 'react'
import { DesktopNavigation, MobileNavigation } from './navigation'
import { useTopNavigation, useIsMobile } from '@/shared/hooks'

interface NavigationBarProps {
	onLoginClick: () => void
}

/**
 * Top navigation bar component that handles responsive navigation
 * Shows DesktopNavigation on larger screens and MobileNavigation with sheet on mobile
 */
export const NavigationBar = ({ onLoginClick }: NavigationBarProps) => {
	const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false)
	const [forceClosePopover, setForceClosePopover] = useState(false)
	const isMobile = useIsMobile()

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

	// Close settings popover when switching to mobile view
	useEffect(() => {
		if (isMobile && isSettingsPopoverOpen) {
			// Force immediate close without animation to prevent jarring UX
			setForceClosePopover(true)
			setIsSettingsPopoverOpen(false)
			// Reset the force close flag after a brief moment
			const timeout = setTimeout(() => setForceClosePopover(false), 100)
			return () => clearTimeout(timeout)
		}
		// Return undefined for other code paths
		return undefined
	}, [isMobile, isSettingsPopoverOpen])

	return (
		<header className='sticky top-0 z-50 w-full border-b supports-backdrop-blur:bg-background/60 bg-background/95 backdrop-blur-sm'>
			<div className='container flex items-center h-14'>
				{/* Desktop Navigation */}
				<DesktopNavigation
					navItems={navContent}
					userItems={userContent}
					onLoginClick={onLoginClick}
					settingsPopoverOpen={isSettingsPopoverOpen}
					setSettingsPopoverOpen={setIsSettingsPopoverOpen}
					forceClosePopover={forceClosePopover}
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
