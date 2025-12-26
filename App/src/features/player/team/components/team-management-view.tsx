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
				title={isLoading ? 'Loading...' : 'My Team'}
				description={
					isLoading
						? 'Loading team details...'
						: 'Manage your team roster, invitations, and settings'
				}
				icon={Users}
				showSeasonIndicator
			/>

			<div className='flex flex-col lg:flex-row items-stretch gap-4 w-full'>
				{/* Main content - appears first on mobile, left side on desktop */}
				<div className='w-full lg:flex-1'>
					<ManageTeamRosterCard
						actions={
							isCaptain ? <ManageCaptainActions /> : <ManageNonCaptainActions />
						}
					/>
				</div>

				{/* Offers panel - appears second on mobile, right side on desktop */}
				<div className='w-full lg:flex-1 space-y-4 min-w-0'>
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
