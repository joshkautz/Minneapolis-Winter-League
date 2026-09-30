import { useUserStatus } from '@/shared/hooks'
import { TeamManagementView, TeamOptionsView } from './components'
import { usePaymentReturnToast } from './hooks/use-payment-return-toast'

/**
 * Main component for team management
 * Routes between team management (if rostered) or team options (join/create)
 */
export const ManageTeam = () => {
	const { isLoading, isRostered, isCaptain } = useUserStatus()
	usePaymentReturnToast({ isLoading, onTeam: isRostered })

	// If user is already rostered, show team management interface
	if (isRostered) {
		return <TeamManagementView isLoading={isLoading} isCaptain={isCaptain} />
	}

	// If user is not rostered, show options to join or create a team
	return <TeamOptionsView isLoading={isLoading} />
}
