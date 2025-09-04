import { HamburgerMenuIcon } from '@radix-ui/react-icons'
import { Button } from '@/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { NavigationMenu, MobileNavigation, UserSection } from './navigation'
import { useTopNavigation } from '@/shared/hooks'

export const TopNav = ({ onLoginClick }: { onLoginClick: () => void }) => {
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
				{/* Desktop */}
				<div className='hidden mr-4 md:flex md:flex-1'>
					<div className='flex items-center justify-between w-full'>
						<NavigationMenu items={navContent} />
						<UserSection
							userContent={userContent}
							onLoginClick={onLoginClick}
						/>
					</div>
				</div>

				{/* Mobile HAMBURGER BUTTON */}
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
						<MobileNavigation
							navItems={navContent}
							userItems={userContent}
							isAuthenticated={!!authStateUser}
							hasPendingOffers={hasPendingOffers}
							hasRequiredTasks={hasRequiredTasks}
							onItemClick={handleCloseMobileNav}
							onSignOut={handleSignOut}
							onLogin={() => handleMobileLogin(onLoginClick)}
							signOutLoading={signOutLoading}
							authStateLoading={authStateLoading}
						/>
					</SheetContent>
				</Sheet>
			</div>
		</header>
	)
}
