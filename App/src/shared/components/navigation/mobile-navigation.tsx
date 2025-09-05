import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ReloadIcon, HamburgerMenuIcon } from '@radix-ui/react-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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
import { MobileThemeToggle } from '../mobile-theme-toggle'

interface MobileNavigationProps {
	navItems: Array<{ label: string; path: string; alt: string }>
	userItems: Array<{ label: string; path: string; alt: string }>
	isAuthenticated: boolean
	hasPendingOffers: number | undefined
	hasRequiredTasks: boolean
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
	isAuthenticated,
	hasPendingOffers,
	hasRequiredTasks,
	isMobileNavOpen,
	setIsMobileNavOpen,
	onItemClick,
	onSignOut,
	onLogin,
	signOutLoading,
	authStateLoading,
}: MobileNavigationProps) => {
	return (
		<Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
			<SheetTrigger asChild>
				<Button
					variant='ghost'
					className='px-0 mr-2 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden'
				>
					<HamburgerMenuIcon className='w-5 h-5' />
					<span className='sr-only'>Toggle Menu</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				side='left'
				className='pr-0 pb-0 !w-[340px] !max-w-[340px] sm:!w-[340px] sm:!max-w-[340px]'
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
					isAuthenticated={isAuthenticated}
					hasPendingOffers={hasPendingOffers}
					hasRequiredTasks={hasRequiredTasks}
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
	isAuthenticated: boolean
	hasPendingOffers: number | undefined
	hasRequiredTasks: boolean
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
	isAuthenticated,
	hasPendingOffers,
	hasRequiredTasks,
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
						<Separator />
					</>
				) : (
					<>
						<Button
							disabled={signOutLoading || authStateLoading}
							onClick={onSignOut}
							className='w-full justify-center h-10 px-3 py-2 text-base font-normal hover:bg-destructive hover:text-destructive-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0 cursor-pointer'
							variant='ghost'
						>
							{(signOutLoading || authStateLoading) && (
								<ReloadIcon className='mr-2 h-4 w-4 animate-spin' />
							)}
							Log Out
						</Button>
						<Separator />
					</>
				)}

				{/* User Profile Section - For Authenticated Users */}
				{isAuthenticated && (
					<>
						{userItems.map(({ path, label, alt }) => (
							<Link
								key={path}
								to={path}
								aria-label={alt}
								onClick={onItemClick}
								className='px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset inline-flex items-center cursor-pointer'
							>
								{path === '/manage' && !!hasPendingOffers ? (
									<>
										{label}
										<span className='relative flex w-2 h-2 ml-1'>
											<span className='relative inline-flex w-2 h-2 rounded-full bg-primary' />
										</span>
									</>
								) : path === '/profile' && hasRequiredTasks ? (
									<>
										{label}
										<span className='relative flex w-2 h-2 ml-1'>
											<span className='relative inline-flex w-2 h-2 rounded-full bg-primary' />
										</span>
									</>
								) : (
									label
								)}
							</Link>
						))}
						<Separator />
					</>
				)}

				{/* Main Navigation */}
				{navItems.map(({ path, label, alt }) => (
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

				<Separator />

				{/* Settings/Preferences Section */}
				<SeasonSelect mobile={true} />
				<MobileThemeToggle />
			</div>
		</ScrollArea>
	)
}
