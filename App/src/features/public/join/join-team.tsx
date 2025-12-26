import { ManageTeamRequestCard } from '@/features/player/team/manage-team-request-card'
import { ManageNonCaptainsOffersPanel } from '@/features/player/team/manage-non-captains-offers-panel'

/**
 * JoinTeam component for users to join existing teams
 * Displays team request form and available offers/invites
 */
export const JoinTeam = () => {
	return (
		<div className='flex flex-col lg:flex-row items-stretch gap-4 w-full'>
			{/* Main request card - appears first on mobile, left side on desktop */}
			<div className='w-full lg:flex-1 space-y-4'>
				<ManageTeamRequestCard />
			</div>

			{/* Offers panel - appears second on mobile, right side on desktop */}
			<div className='w-full lg:flex-1'>
				<ManageNonCaptainsOffersPanel />
			</div>
		</div>
	)
}
