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

			<div className='flex flex-row justify-center gap-8 flex-wrap-reverse'>
				{/* LEFT SIDE PANEL */}
				<div className='max-w-[600px] flex-1 basis-80 space-y-4'>
					<ManageTeamRosterCard
						actions={
							isCaptain ? <ManageCaptainActions /> : <ManageNonCaptainActions />
						}
					/>
					{isCaptain && <ManageInvitePlayerList />}
				</div>

				{/* RIGHT SIDE PANEL */}
				{isCaptain ? (
					<ManageCaptainsOffersPanel />
				) : (
					<ManageNonCaptainsOffersPanel />
				)}
			</div>
		</PageContainer>
	)
}
