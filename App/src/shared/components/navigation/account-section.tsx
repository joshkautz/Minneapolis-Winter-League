import { useAccountSection } from '@/shared/hooks'
import { LoginButton } from './login-button'
import { UserDropdown } from './user-dropdown'
import { LoadingSpinner } from './loading-spinner'

interface AccountSectionProps {
	userContent: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

/**
 * Desktop account section with authentication and user account features
 */
export const AccountSection = ({
	userContent,
	onLoginClick,
}: AccountSectionProps) => {
	const {
		authStateUser,
		userInitials,
		hasPendingOffers,
		hasRequiredTasks,
		isLoading,
		signOutLoading,
		handleSignOut,
	} = useAccountSection()

	// Loading state
	if (isLoading) {
		return <LoadingSpinner />
	}

	// Not authenticated - show login button
	if (!authStateUser) {
		return <LoginButton onLoginClick={onLoginClick} />
	}

	// Authenticated - show user dropdown
	return (
		<UserDropdown
			userInitials={userInitials}
			userContent={userContent}
			hasPendingOffers={hasPendingOffers}
			hasRequiredTasks={hasRequiredTasks}
			signOutLoading={signOutLoading}
			onSignOut={handleSignOut}
		/>
	)
}
