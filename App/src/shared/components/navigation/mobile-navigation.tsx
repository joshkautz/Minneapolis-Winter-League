import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ReloadIcon } from '@radix-ui/react-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SeasonSelect } from '../season-select'

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
		<ScrollArea className="my-4 h-[calc(100vh-8rem)] pb-10 px-6">
			<div className="flex flex-col space-y-3">
				<SeasonSelect handleCloseMobileNav={onItemClick} />
				{navItems.map(({ path, label, alt }) => (
					<Link
						key={path}
						to={path}
						aria-label={alt}
						onClick={onItemClick}
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
								className="inline-flex"
							>
								{path === '/manage' && !!hasPendingOffers ? (
									<>
										{label}
										<span className="relative flex w-2 h-2 ml-1">
											<span className="relative inline-flex w-2 h-2 rounded-full bg-primary"></span>
										</span>
									</>
								) : path === '/profile' && hasRequiredTasks ? (
									<>
										{label}
										<span className="relative flex w-2 h-2 ml-1">
											<span className="relative inline-flex w-2 h-2 rounded-full bg-primary"></span>
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
					>
						{(signOutLoading || authStateLoading) && (
							<ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
						)}
						Log Out
					</Button>
				) : (
					<Button
						onClick={onLogin}
						disabled={authStateLoading}
					>
						Login
					</Button>
				)}
			</div>
		</ScrollArea>
	)
}
