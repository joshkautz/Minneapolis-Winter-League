import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ReloadIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { useOffersContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { errorHandler, logger } from '@/shared/utils'

const getInitials = (
	firstName: string | undefined,
	lastName: string | undefined
) => {
	if (!firstName || !lastName) return 'NA'
	return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

interface UserAvatarProps {
	userContent: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

export const UserAvatar = ({ userContent, onLoginClick }: UserAvatarProps) => {
	const {
		authStateUser,
		authStateLoading,
		authenticatedUserSnapshot,
		signOut,
		signOutLoading,
	} = useAuthContext()
	const { incomingOffersQuerySnapshot } = useOffersContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const userInitials = useMemo(() => {
		if (!authenticatedUserSnapshot) return 'NA'
		const data = authenticatedUserSnapshot.data()
		return getInitials(data?.firstname, data?.lastname)
	}, [authenticatedUserSnapshot])

	const hasPendingOffers = useMemo(
		() => !!incomingOffersQuerySnapshot?.docs.length,
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
			isAuthenticatedUserPaid === false || isAuthenticatedUserSigned === false,
		[isAuthenticatedUserPaid, isAuthenticatedUserSigned]
	)

	const isLoading = useMemo(
		() =>
			(!authStateUser && authStateLoading) ||
			(authStateUser && !authenticatedUserSnapshot),
		[authStateUser, authStateLoading, authenticatedUserSnapshot]
	)

	const handleSignOut = async () => {
		try {
			const success = await signOut()
			if (success) {
				toast.success('Logged out successfully', {
					description: 'You have been signed out of your account.',
				})
			} else {
				toast.error('Failed to log out', {
					description: 'Please try again.',
				})
			}
		} catch (error) {
			logger.error(
				'Sign out failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'UserAvatar',
					userId: authStateUser?.uid,
				}
			)
			errorHandler.handleAuth(error, 'sign_out', {
				fallbackMessage: 'An unexpected error occurred while signing out',
			})
		}
	}

	// Loading state
	if (isLoading) {
		return <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
	}

	// Not authenticated - show login button
	if (!authStateUser) {
		return (
			<Button variant="default" onClick={onLoginClick}>
				Login
			</Button>
		)
	}

	// Authenticated - show user dropdown
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className="overflow-visible cursor-pointer">
					{(hasPendingOffers || hasRequiredTasks) && (
						<span className="z-10 absolute bottom-0 right-0 w-2 h-2 rounded-full bg-primary" />
					)}
					<AvatarFallback className="transition-colors bg-secondary hover:bg-accent dark:hover:text-background uppercase">
						{userInitials}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56">
				<DropdownMenuGroup>
					{userContent.map(({ path, label, alt }) => (
						<DropdownMenuItem key={path} asChild>
							<Link to={path} aria-label={alt} className="flex items-center">
								{path === '/manage' && hasPendingOffers ? (
									<>
										{label}
										<span className="relative flex w-2 h-2 ml-auto">
											<span className="relative inline-flex w-2 h-2 rounded-full bg-primary" />
										</span>
									</>
								) : path === '/profile' && hasRequiredTasks ? (
									<>
										{label}
										<span className="relative flex w-2 h-2 ml-auto">
											<span className="relative inline-flex w-2 h-2 rounded-full bg-primary" />
										</span>
									</>
								) : (
									label
								)}
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleSignOut}
					disabled={signOutLoading}
					className="cursor-pointer"
				>
					{signOutLoading ? (
						<>
							<ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
							Logging out...
						</>
					) : (
						'Log out'
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
