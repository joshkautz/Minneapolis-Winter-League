import { NavigationMenu } from './navigation-menu'
import { SettingsSection } from './settings-section'
import { AccountSection } from './account-section'

interface DesktopNavigationProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

/**
 * Desktop navigation component that combines main navigation, settings, and account sections
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
			<div className='flex items-center justify-end flex-1 gap-4'>
				<SettingsSection />
				<AccountSection userContent={userItems} onLoginClick={onLoginClick} />
			</div>
		</div>
	)
}
