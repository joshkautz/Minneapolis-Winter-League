import React from 'react'
import { ManageTeamRequestCard } from '@/features/player/team/manage-team-request-card'
import { ManageNonCaptainsOffersPanel } from '@/features/player/team/manage-non-captains-offers-panel'

/**
 * JoinTeam component for users to join existing teams
 * Displays team request form and available offers/invites
 */
export const JoinTeam: React.FC = () => {
	return (
		<div className='flex flex-col lg:flex-row justify-center items-center lg:items-start gap-4 max-w-6xl mx-auto'>
			{/* Main request card - appears first on mobile, left side on desktop */}
			<div className='w-full max-w-2xl lg:flex-1 lg:max-w-none space-y-4'>
				<ManageTeamRequestCard />
			</div>

			{/* Offers panel - appears second on mobile, right side on desktop */}
			<div className='w-full max-w-2xl lg:flex-1 lg:max-w-none'>
				<ManageNonCaptainsOffersPanel />
			</div>
		</div>
	)
}
