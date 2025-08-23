import { ReactNode } from 'react'
import { NotificationCard } from '@/shared/components'
import { TeamCreationToggle } from './team-creation-toggle'

interface TeamCreationFormWrapperProps {
	rolloverMode: boolean
	onToggleMode: () => void
	children: ReactNode
}

/**
 * Wrapper component for team creation forms with toggle functionality
 */
export const TeamCreationFormWrapper = ({
	rolloverMode,
	onToggleMode,
	children,
}: TeamCreationFormWrapperProps) => {
	return (
		<NotificationCard
			className='w-full min-w-0'
			title='Team Creation Form'
			description="Create a team to compete in the upcoming season. You can create a new team from scratch, or rollover a team you've captained in a previous season."
			moreActions={
				<TeamCreationToggle
					rolloverMode={rolloverMode}
					onToggle={onToggleMode}
				/>
			}
		>
			{children}
		</NotificationCard>
	)
}
