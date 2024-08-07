import { HamburgerMenuIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useState, useContext } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AuthContext } from '@/firebase/auth-context'
import { UserAvatar } from '@/components/user-avatar'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from './theme-toggle'
import { OffersContext } from '@/firebase/offers-context'
import { UserForm } from './user-form'
import { toast } from './ui/use-toast'
import { cn } from '@/lib/utils'

export const TopNav = ({
	title,
	isOpen,
	setIsOpen,
}: {
	title: string
	isOpen: boolean
	setIsOpen: () => void
}) => {
	const {
		authStateUser,
		authStateLoading,
		documentSnapshot,
		signOut,
		signOutLoading,
	} = useContext(AuthContext)
	const { incomingOffersQuerySnapshot } = useContext(OffersContext)

	const [open, setOpen] = useState(false)

	const hasPendingOffers = incomingOffersQuerySnapshot?.docs.filter(
		(entry) => entry.data().status === 'pending'
	).length
	const isRostered = documentSnapshot?.data()?.team
	const isCaptain = documentSnapshot?.data()?.captain
	const isVerified = authStateUser?.emailVerified
	const isRegistered = documentSnapshot?.data()?.registered
	const hasRequiredTasks = !isVerified || !isRegistered

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
		{ label: 'Your Team', path: '/team', alt: 'team profile' },
	]

	const unrosteredContent = [
		{ label: 'Join a Team', path: '/manage', alt: 'team management' },
		{ label: 'Create a Team', path: '/create', alt: 'team creation' },
	]

	const userContent = [
		{ label: 'Edit Profile', path: '/profile', alt: 'user profile' },
		...(authStateUser
			? isCaptain
				? captainContent
				: isRostered
					? rosteredContent
					: unrosteredContent
			: []),
	]

	const handleClick = () => {
		setOpen(!open)
	}

	return (
		<header
			className={
				'sticky top-0 z-50 w-full border-b supports-backdrop-blur:bg-background/60 bg-background/95 backdrop-blur'
			}
		>
			<div className={'container flex items-center h-14'}>
				{/* Nav */}
				<div className={'hidden mr-4 md:flex md:flex-1'}>
					<Link to={'/'} className={'flex items-center mr-6 space-x-2'}>
						<span className={'hidden font-bold sm:inline-block'}>{title}</span>
					</Link>
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
							<div>
								<ThemeToggle />
							</div>
							<UserAvatar userContent={userContent} />
						</div>
					</nav>
				</div>

				<Sheet open={isOpen} onOpenChange={setIsOpen}>
					<SheetContent className="w-full pt-10">
						<UserForm closeMobileSheet={setIsOpen} />
					</SheetContent>
				</Sheet>

				{/* Mobile */}
				<Sheet open={open} onOpenChange={setOpen}>
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
					<SheetContent side={'top'} className={'pr-0'}>
						<Link
							to={'/'}
							className={'flex items-center'}
							onClick={handleClick}
						>
							{/* <div className={'w-6 h-6 rounded-full bg-primary'} /> */}
							{/* <span className={'ml-1 hidden font-bold sm:inline-block'}>
								Minneapolis Winter League
							</span> */}
						</Link>
						<ScrollArea className={'my-4 h-[calc(100vh-8rem)] pb-10 px-6'}>
							<div className={'flex flex-col space-y-3'}>
								{navContent.map(({ path, label, alt }) => (
									<Link
										key={path}
										to={path}
										aria-label={alt}
										onClick={handleClick}
									>
										{label}
									</Link>
								))}
								{authStateUser && (
									// Mostly placeholder links for now will refine later.
									<>
										<Separator />
										{userContent.map(({ path, label, alt }) => {
											return path === '/create' ? (
												<span key={path} className="inline-flex text-slate-500">
													{label}
												</span>
											) : (
												<Link
													key={path}
													to={path}
													aria-label={alt}
													onClick={handleClick}
													className="inline-flex"
												>
													{path === '/manage' && !!hasPendingOffers ? (
														<>
															{label}
															<span className="relative flex w-2 h-2 ml-1">
																{/* <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-primary"></span> */}
																<span className="relative inline-flex w-2 h-2 rounded-full bg-primary"></span>
															</span>
														</>
													) : path === '/profile' && hasRequiredTasks ? (
														<>
															{label}
															<span className="relative flex w-2 h-2 ml-1">
																{/* <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-primary"></span> */}
																<span className="relative inline-flex w-2 h-2 rounded-full bg-primary"></span>
															</span>
														</>
													) : (
														label
													)}
												</Link>
											)
										})}
										<Separator />
									</>
								)}
								{authStateUser ? (
									<Button
										disabled={signOutLoading || authStateLoading}
										onClick={() => {
											signOut()
												.then(() => {
													toast({
														title: 'Logged Out',
														description:
															'You are no longer signed in to an account.',
													})
													handleClick()
												})
												.catch(() => {
													toast({
														title: 'Unable to Log Out',
														description:
															'Ensure your email is verified. Please try again later.',
													})
												})
										}}
									>
										{(signOutLoading || authStateLoading) && (
											<ReloadIcon className={'mr-2 h-4 w-4 animate-spin'} />
										)}
										Log Out
									</Button>
								) : (
									<Button
										onClick={() => {
											setIsOpen()
											setOpen(false)
										}}
										disabled={authStateLoading}
									>
										Login
									</Button>
								)}
								{/* <AuthButton loading={authStateLoading} user={authStateUser} /> */}
							</div>
						</ScrollArea>
					</SheetContent>
				</Sheet>
			</div>
		</header>
	)
}
