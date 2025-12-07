import { Users } from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'
import { ManageTeamRosterCard } from '../manage-team-roster-card'
import { ManageInvitePlayerList } from '../manage-invite-player-list'
import { ManageCaptainActions } from '../manage-captain-actions'
import { ManageNonCaptainActions } from '../manage-non-captain-actions'
import { ManageCaptainsOffersPanel } from '../manage-captains-offers-panel'
import { ManageNonCaptainsOffersPanel } from '../manage-non-captains-offers-panel'

interface TeamManagementViewProps {
	isLoading: boolean
	isCaptain: boolean
}

/**
 * Component for managing existing team - roster, invitations, and settings
 * Displayed when user is already rostered on a team
 */
export const TeamManagementView = ({
	isLoading,
	isCaptain,
}: TeamManagementViewProps) => {
	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title={isLoading ? 'Loading...' : 'Team Management'}
				description={
					isLoading
						? 'Loading team management...'
						: 'Manage team roster, invitations, and settings'
				}
				icon={Users}
			/>

			<div className='flex flex-col lg:flex-row justify-center items-center lg:items-start gap-4 max-w-6xl mx-auto'>
				{/* Main content - appears first on mobile, left side on desktop */}
				<div className='w-full max-w-2xl lg:w-1/2 lg:max-w-none'>
					<ManageTeamRosterCard
						actions={
							isCaptain ? <ManageCaptainActions /> : <ManageNonCaptainActions />
						}
					/>
				</div>

				{/* Offers panel - appears second on mobile, right side on desktop */}
				<div className='w-full max-w-2xl lg:w-1/2 lg:max-w-none space-y-4 min-w-0 overflow-hidden'>
					{isCaptain ? (
						<ManageCaptainsOffersPanel />
					) : (
						<ManageNonCaptainsOffersPanel />
					)}
					{isCaptain && <ManageInvitePlayerList />}
				</div>
			</div>
		</PageContainer>
	)
}
