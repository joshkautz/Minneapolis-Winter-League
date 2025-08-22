import { HamburgerMenuIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useState, useMemo } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthContext } from '@/providers'
import { UserAvatar } from '@/features/auth'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from './theme-toggle'
import { useOffersContext } from '@/providers'
import { toast } from 'sonner'
import { cn } from '@/shared/utils'
import { useSeasonsContext } from '@/providers'
import { SeasonSelect } from './season-select'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export const TopNav = ({ onLoginClick }: { onLoginClick: () => void }) => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		signOut,
		signOutLoading,
	} = useAuthContext()
	const { incomingOffersQuerySnapshot } = useOffersContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserRostered = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.some(
					(item) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
						item.team
				),
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasPendingOffers = useMemo(
		() => incomingOffersQuerySnapshot?.docs.length,
		[incomingOffersQuerySnapshot]
	)

	const isAuthenticatedUserPaid = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isAuthenticatedUserSigned = useMemo(
		() =>
			authenticatedUserSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed,
		[authenticatedUserSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const hasRequiredTasks = useMemo(
		() =>
			// authStateUser?.emailVerified === false ||
			isAuthenticatedUserPaid === false || isAuthenticatedUserSigned === false,
		[authStateUser, isAuthenticatedUserPaid, isAuthenticatedUserSigned]
	)

	const navContent = [
		{ label: 'Home', path: '/#welcome', alt: 'home page' },
		{ label: 'Schedule', path: '/schedule', alt: 'league schedule' },
		{ label: 'Standings', path: '/standings', alt: 'league standings' },
		{ label: 'Teams', path: '/teams', alt: 'team list' },
	]

	const captainContent = [
		{ label: 'Manage Team', path: '/manage', alt: 'team management' },
	]

	const rosteredContent = [
		{ label: 'Your Team', path: '/manage', alt: 'team profile' },
	]

	const unrosteredContent = [
		{ label: 'Join a Team', path: '/manage', alt: 'team management' },
		{ label: 'Create a Team', path: '/create', alt: 'team creation' },
	]

	const userContent = [
		{ label: 'Edit Profile', path: '/profile', alt: 'user profile' },
		...(authStateUser
			? isAuthenticatedUserCaptain
				? captainContent
				: isAuthenticatedUserRostered
					? rosteredContent
					: unrosteredContent
			: []),
	]

	const handleCloseMobileNav = () => {
		if (isMobileNavOpen) {
			setIsMobileNavOpen(false)
		}
	}

	const handleSignOut = async () => {
		try {
			const success = await signOut()
			if (success) {
				toast.success('Logged Out', {
					description: 'You are no longer signed in to an account.',
				})
				handleCloseMobileNav()
			} else {
				toast.error('Unable to Log Out', {
					description: 'Please try again later.',
				})
			}
		} catch (error) {
			toast.error('Unable to Log Out', {
				description: 'An unexpected error occurred.',
			})
		}
	}

	const handleMobileLogin = () => {
		onLoginClick()
		setIsMobileNavOpen(false)
	}

	return (
		<header
			className={
				'sticky top-0 z-50 w-full border-b supports-backdrop-blur:bg-background/60 bg-background/95 backdrop-blur-sm'
			}
		>
			<div className={'container flex items-center h-14'}>
				{/* Desktop */}
				<div className={'hidden mr-4 md:flex md:flex-1'}>
					<nav
						className={
							'flex items-center justify-start space-x-6 text-sm font-medium flex-1'
						}
					>
						{navContent.map((entry) => (
							<NavLink
								key={entry.path}
								to={entry.path}
								className={({ isActive }) =>
									cn(
										'transition-colors hover:text-foreground/80 text-foreground/60',
										isActive ? 'text-foreground' : ''
									)
								}
							>
								{entry.label}
							</NavLink>
						))}

						<div className="flex items-center justify-end flex-1 gap-4">
							<SeasonSelect />
							<ThemeToggle />
							<UserAvatar
								userContent={userContent}
								onLoginClick={onLoginClick}
							/>
						</div>
					</nav>
				</div>

				{/* Mobile HAMBURGER BUTTON */}
				<Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
					<SheetTrigger asChild>
						<Button
							variant={'ghost'}
							className={
								'px-0 mr-2 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden'
							}
						>
							<HamburgerMenuIcon className={'w-5 h-5'} />
							<span className={'sr-only'}>Toggle Menu</span>
						</Button>
					</SheetTrigger>
					<VisuallyHidden>
						<SheetTitle>Mobile nav menu</SheetTitle>
						<SheetDescription>Mobile nav menu</SheetDescription>
					</VisuallyHidden>
					<SheetContent side={'top'} className={'pr-0'}>
						<ScrollArea className={'my-4 h-[calc(100vh-8rem)] pb-10 px-6'}>
							<div className={'flex flex-col space-y-3'}>
								<SeasonSelect handleCloseMobileNav={handleCloseMobileNav} />
								{navContent.map(({ path, label, alt }) => (
									<Link
										key={path}
										to={path}
										aria-label={alt}
										onClick={handleCloseMobileNav}
									>
										{label}
									</Link>
								))}
								{authStateUser && (
									<>
										<Separator />
										{userContent.map(({ path, label, alt }) => (
											<Link
												key={path}
												to={path}
												aria-label={alt}
												onClick={handleCloseMobileNav}
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
								{authStateUser ? (
									<Button
										disabled={signOutLoading || authStateLoading}
										onClick={handleSignOut}
									>
										{(signOutLoading || authStateLoading) && (
											<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
										)}
										Log Out
									</Button>
								) : (
									<Button
										onClick={handleMobileLogin}
										disabled={authStateLoading}
									>
										Login
									</Button>
								)}
							</div>
						</ScrollArea>
					</SheetContent>
				</Sheet>
			</div>
		</header>
	)
}
