import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { HamburgerMenuIcon } from '@radix-ui/react-icons'
import { LoadingSpinner } from '@/shared/components'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SeparatorWithText } from '@/components/ui/separator-with-text'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { SeasonSelect } from '../season-select'
import { ThemeSelect } from '../theme-select'
import { NotificationBadge } from './notification-badge'
import { NewBadge } from '../new-badge'

interface MobileNavigationProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	adminItems: Array<{ label: string; path: string; alt: string }>
	isAuthenticated: boolean
	isAuthenticatedUserAdmin: boolean
	pendingOffersCount: number | undefined
	requiredTasksCount: number
	isMobileNavOpen: boolean
	setIsMobileNavOpen: (open: boolean) => void
	onItemClick: () => void
	onSignOut: () => void
	onLogin: () => void
	signOutLoading: boolean
	authStateLoading: boolean
}

/**
 * Mobile navigation menu component with hamburger button and sheet
 */
export const MobileNavigation = ({
	navItems,
	userItems,
	adminItems,
	isAuthenticated,
	isAuthenticatedUserAdmin,
	pendingOffersCount,
	requiredTasksCount,
	isMobileNavOpen,
	setIsMobileNavOpen,
	onItemClick,
	onSignOut,
	onLogin,
	signOutLoading,
	authStateLoading,
}: MobileNavigationProps) => {
	const totalNotifications = isAuthenticated
		? (pendingOffersCount || 0) + requiredTasksCount
		: 0

	return (
		<Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
			<SheetTrigger asChild>
				<Button
					variant='ghost'
					className='px-0 mr-2 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden relative'
				>
					<HamburgerMenuIcon className='w-5 h-5' />
					<span className='sr-only'>Toggle Menu</span>
					<NotificationBadge
						count={totalNotifications}
						position='button-overlay'
					/>
				</Button>
			</SheetTrigger>
			<SheetContent
				side='left'
				className='pr-0 pb-0 w-full max-w-[340px] sm:!max-w-[340px]'
			>
				<SheetHeader className='pr-8'>
					<VisuallyHidden>
						<SheetTitle>Mobile Navigation Menu</SheetTitle>
						<SheetDescription>
							Navigate through the application pages and features
						</SheetDescription>
					</VisuallyHidden>
				</SheetHeader>
				<MobileNavigationContent
					navItems={navItems}
					userItems={userItems}
					adminItems={adminItems}
					isAuthenticated={isAuthenticated}
					isAuthenticatedUserAdmin={isAuthenticatedUserAdmin}
					pendingOffersCount={pendingOffersCount}
					requiredTasksCount={requiredTasksCount}
					onItemClick={onItemClick}
					onSignOut={onSignOut}
					onLogin={onLogin}
					signOutLoading={signOutLoading}
					authStateLoading={authStateLoading}
				/>
			</SheetContent>
		</Sheet>
	)
}

interface MobileNavigationContentProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	adminItems: Array<{ label: string; path: string; alt: string }>
	isAuthenticated: boolean
	isAuthenticatedUserAdmin: boolean
	pendingOffersCount: number | undefined
	requiredTasksCount: number
	onItemClick: () => void
	onSignOut: () => void
	onLogin: () => void
	signOutLoading: boolean
	authStateLoading: boolean
}

/**
 * Mobile navigation menu content (inside the sheet)
 */
const MobileNavigationContent = ({
	navItems,
	userItems,
	adminItems,
	isAuthenticated,
	isAuthenticatedUserAdmin,
	pendingOffersCount,
	requiredTasksCount,
	onItemClick,
	onSignOut,
	onLogin,
	signOutLoading,
	authStateLoading,
}: MobileNavigationContentProps) => {
	return (
		<ScrollArea className='h-[calc(100vh-6rem)] pb-6 px-6'>
			<div className='flex flex-col space-y-3 pt-2'>
				{/* Authentication Section - Top Priority */}
				{!isAuthenticated ? (
					<>
						<Button
							onClick={onLogin}
							disabled={authStateLoading}
							className='w-full justify-center h-10 px-3 py-2 text-base font-normal bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 cursor-pointer'
							variant='default'
						>
							Log In
						</Button>
						<SeparatorWithText>Navigation</SeparatorWithText>
					</>
				) : (
					<>
						<Button
							disabled={signOutLoading || authStateLoading}
							onClick={onSignOut}
							className='w-full justify-center h-10 px-3 py-2 text-base font-normal bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:text-destructive-foreground dark:hover:bg-destructive/80 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0 cursor-pointer'
							variant='destructive'
						>
							{(signOutLoading || authStateLoading) && (
								<LoadingSpinner size='sm' className='mr-2' />
							)}
							{signOutLoading || authStateLoading
								? 'Logging Out...'
								: 'Log Out'}
						</Button>
						<SeparatorWithText>Navigation</SeparatorWithText>
					</>
				)}

				{/* Main Navigation */}
				{navItems.map(({ path, label, alt }) => (
					<Link
						key={path}
						to={path}
						aria-label={alt}
						onClick={onItemClick}
						className='px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset cursor-pointer flex items-center justify-between'
					>
						{label}
						{/* {(label === 'Player Rankings' || label === 'News') && <NewBadge />} */}
					</Link>
				))}

				{/* User Profile Section - For Authenticated Users */}
				{isAuthenticated && (
					<>
						<SeparatorWithText>Account</SeparatorWithText>
						{userItems.map(({ path, label, alt }) => (
							<Link
								key={path}
								to={path}
								aria-label={alt}
								onClick={onItemClick}
								className='px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset inline-flex items-center cursor-pointer'
							>
								{label}
								{path === '/manage' && !!pendingOffersCount && (
									<NotificationBadge
										count={pendingOffersCount}
										position='inline'
									/>
								)}
								{path === '/profile' && requiredTasksCount > 0 && (
									<NotificationBadge
										count={requiredTasksCount}
										position='inline'
									/>
								)}
							</Link>
						))}
					</>
				)}

				{/* Admin Section - For Admin Users */}
				{isAuthenticated &&
					isAuthenticatedUserAdmin &&
					adminItems.length > 0 && (
						<>
							<SeparatorWithText>Admin</SeparatorWithText>
							{adminItems.map(({ path, label, alt }) => (
								<Link
									key={path}
									to={path}
									aria-label={alt}
									onClick={onItemClick}
									className='px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset cursor-pointer'
								>
									{label}
								</Link>
							))}
						</>
					)}

				<SeparatorWithText>Settings</SeparatorWithText>

				{/* Settings/Preferences Section */}
				<SeasonSelect mobile={true} />
				<ThemeSelect mobile={true} />
			</div>
		</ScrollArea>
	)
}
