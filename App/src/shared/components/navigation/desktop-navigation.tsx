import { NavigationMenu } from './navigation-menu'
import { UserSection } from './user-section'

interface DesktopNavigationProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

/**
 * Desktop navigation component that combines main navigation and user section
 * Includes responsive wrapper that hides on mobile screens
 */
export const DesktopNavigation = ({
	navItems,
	userItems,
	onLoginClick,
}: DesktopNavigationProps) => {
	return (
		<div className='hidden mr-4 md:flex md:flex-1 items-center justify-between w-full'>
			<NavigationMenu items={navItems} />
			<UserSection userContent={userItems} onLoginClick={onLoginClick} />
		</div>
	)
}
