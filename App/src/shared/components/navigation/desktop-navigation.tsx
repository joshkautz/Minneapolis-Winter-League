import { Dispatch, SetStateAction } from 'react'
import { NavigationMenu } from './navigation-menu'
import { SettingsSection } from './settings-section'
import { AccountSection } from './account-section'

interface DesktopNavigationProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
	settingsPopoverOpen: boolean
	setSettingsPopoverOpen: Dispatch<SetStateAction<boolean>>
	accountPopoverOpen: boolean
	setAccountPopoverOpen: Dispatch<SetStateAction<boolean>>
	forceClosePopover: boolean
}

/**
 * Desktop navigation component that combines main navigation, settings, and account sections
 * Includes responsive wrapper that hides on mobile screens
 */
export const DesktopNavigation = ({
	navItems,
	userItems,
	onLoginClick,
	settingsPopoverOpen,
	setSettingsPopoverOpen,
	accountPopoverOpen,
	setAccountPopoverOpen,
	forceClosePopover,
}: DesktopNavigationProps) => {
	return (
		<div className='hidden mr-4 md:flex md:flex-1 items-center justify-between w-full'>
			<NavigationMenu items={navItems} />
			<div className='flex items-center justify-end flex-1 gap-4'>
				<SettingsSection
					isOpen={settingsPopoverOpen}
					setIsOpen={setSettingsPopoverOpen}
					forceClose={forceClosePopover}
				/>
				<AccountSection
					userContent={userItems}
					onLoginClick={onLoginClick}
					accountPopoverOpen={accountPopoverOpen}
					setAccountPopoverOpen={setAccountPopoverOpen}
					forceClosePopover={forceClosePopover}
				/>
			</div>
		</div>
	)
}
