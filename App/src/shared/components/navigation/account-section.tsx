import { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { useAccountSection } from '@/shared/hooks'
import { LoginButton } from './login-button'
import { LoadingSpinner } from '@/shared/components'
import { NotificationBadge } from './notification-badge'
import { Button } from '@/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { SeparatorWithText } from '@/components/ui/separator-with-text'
import { cn } from '@/shared/utils'

interface AccountSectionProps {
	userContent: Array<{ label: string; path: string; alt: string }>
	adminContent: Array<{ label: string; path: string; alt: string }>
	isAuthenticatedUserAdmin: boolean
	onLoginClick: () => void
	isOpen: boolean
	setIsOpen: Dispatch<SetStateAction<boolean>>
	forceClose: boolean
	pendingOffersCount: number | undefined
	requiredTasksCount: number
}

/**
 * Desktop account section with authentication and user account features
 */
export const AccountSection = ({
	userContent,
	adminContent,
	isAuthenticatedUserAdmin,
	onLoginClick,
	isOpen,
	setIsOpen,
	forceClose,
	pendingOffersCount,
	requiredTasksCount,
}: AccountSectionProps) => {
	const { authStateUser, isLoading, signOutLoading, handleSignOut } =
		useAccountSection()

	// Loading state
	if (isLoading) {
		return <LoadingSpinner />
	}

	// Not authenticated - show login button
	if (!authStateUser) {
		return <LoginButton onLoginClick={onLoginClick} />
	}

	// Authenticated - show user popover
	const totalNotifications = (pendingOffersCount || 0) + requiredTasksCount

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					variant='ghost'
					size='sm'
					className='px-0 w-9 relative'
					aria-label='Open account menu'
				>
					<User className='h-4 w-4' aria-hidden='true' />
					<NotificationBadge
						count={totalNotifications}
						position='button-overlay'
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					'w-80',
					forceClose && '!animate-none !duration-0 !transition-none'
				)}
				align='end'
			>
				<SeparatorWithText>Account</SeparatorWithText>
				<div className='space-y-1'>
					{userContent.map(({ path, label, alt }) => (
						<Link
							key={path}
							to={path}
							aria-label={alt}
							className='flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground transition-colors'
						>
							<span className='flex items-center'>
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
							</span>
						</Link>
					))}
				</div>

				{/* Admin Section */}
				{isAuthenticatedUserAdmin && adminContent.length > 0 && (
					<>
						<SeparatorWithText>Admin</SeparatorWithText>
						<div className='space-y-1'>
							{adminContent.map(({ path, label, alt }) => (
								<Link
									key={path}
									to={path}
									aria-label={alt}
									className='flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground transition-colors'
								>
									<span>{label}</span>
								</Link>
							))}
						</div>
					</>
				)}

				<div className='border-t my-1' />
				<Button
					onClick={handleSignOut}
					disabled={signOutLoading}
					variant='destructive'
					className='w-full justify-center h-8 px-3 py-1.5 text-sm font-normal bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:text-destructive-foreground dark:hover:bg-destructive/80 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0 cursor-pointer'
				>
					{signOutLoading ? (
						<>
							<LoadingSpinner size='sm' className='mr-2' />
							Logging out...
						</>
					) : (
						'Log Out'
					)}
				</Button>
			</PopoverContent>
		</Popover>
	)
}
