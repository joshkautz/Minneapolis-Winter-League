import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ReloadIcon } from '@radix-ui/react-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SeasonSelect } from '../season-select'
import { MobileThemeToggle } from '../mobile-theme-toggle'

interface MobileNavigationProps {
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
 * Mobile navigation menu component
 */
export const MobileNavigation = ({
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
}: MobileNavigationProps) => {
	return (
		<ScrollArea className='h-[calc(100vh-6rem)] pb-6 px-6'>
			<div className='flex flex-col space-y-3 pt-2'>
				<SeasonSelect mobile={true} />
				<MobileThemeToggle />
				<Separator />
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
				{isAuthenticated && (
					<>
						<Separator />
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
				{isAuthenticated ? (
					<Button
						disabled={signOutLoading || authStateLoading}
						onClick={onSignOut}
						className='w-full justify-start hover:bg-destructive hover:text-destructive-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0 focus-visible:ring-inset'
						variant='ghost'
					>
						{(signOutLoading || authStateLoading) && (
							<ReloadIcon className='mr-2 h-4 w-4 animate-spin' />
						)}
						Log Out
					</Button>
				) : (
					<Button
						onClick={onLogin}
						disabled={authStateLoading}
						className='w-full justify-start h-10 px-3 py-2 text-sm font-normal bg-accent text-accent-foreground hover:bg-accent/80 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset cursor-pointer'
						variant='ghost'
					>
						Login
					</Button>
				)}
			</div>
		</ScrollArea>
	)
}
