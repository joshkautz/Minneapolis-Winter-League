import React from 'react'
import { LoadingSpinner, NotificationCard } from '@/shared/components'
import { CreateTeamForm } from './create-team-form'
import { RolloverTeamForm } from './rollover-team-form'
import { TeamCreationStatusCard, TeamCreationFormWrapper } from './components'
import { useTeamCreation } from './hooks'

export const CreateTeam: React.FC = () => {
	const {
		rolloverMode,
		isSubmitting,
		isLoading,
		isRostered,
		setNewTeamDocument,
		setIsSubmitting,
		handleResult,
		toggleRolloverMode,
	} = useTeamCreation()

	if (isLoading || isSubmitting) {
		return (
			<div
				className='flex items-center justify-center min-h-[400px]'
				role='status'
				aria-live='polite'
				aria-label={
					isLoading ? 'Loading team creation form...' : 'Creating team...'
				}
			>
				<LoadingSpinner
					size='lg'
					label={isLoading ? 'Loading...' : 'Creating team...'}
				/>
			</div>
		)
	}

	if (isRostered) {
		return (
			<div className='flex justify-center'>
				<TeamCreationStatusCard isRostered={isRostered} />
			</div>
		)
	}

	return (
		<div className='flex justify-center'>
			<div className='w-full max-w-2xl'>
				<NotificationCard
					title='Create Team'
					description='Create a new team or rollover an existing team for the upcoming season'
				>
					<TeamCreationFormWrapper
						rolloverMode={rolloverMode}
						onToggleMode={toggleRolloverMode}
						createNewForm={
							<CreateTeamForm
								isSubmitting={isSubmitting}
								setIsSubmitting={setIsSubmitting}
								setNewTeamDocument={setNewTeamDocument}
								handleResult={handleResult}
							/>
						}
						rolloverForm={
							<RolloverTeamForm
								isSubmitting={isSubmitting}
								setIsSubmitting={setIsSubmitting}
								setNewTeamDocument={setNewTeamDocument}
								handleResult={handleResult}
							/>
						}
					/>
				</NotificationCard>
			</div>
		</div>
	)
}
