import { LoadingSpinner, NotificationCard } from '@/shared/components'
import { CreateTeamForm } from './create-team-form'
import { RolloverTeamForm } from './rollover-team-form'
import { TeamCreationStatusCard, TeamCreationFormWrapper } from './components'
import { useTeamCreation } from './hooks'

export const CreateTeam = () => {
	const {
		rolloverMode,
		isLoading,
		isRostered,
		isTeamRegistrationFull,
		currentSeasonQueryDocumentSnapshot,
		setNewTeamDocument,
		handleResult,
		toggleRolloverMode,
	} = useTeamCreation()

	if (isLoading) {
		return (
			<div
				className='flex items-center justify-center min-h-[400px]'
				role='status'
				aria-live='polite'
				aria-label='Loading team creation form...'
			>
				<LoadingSpinner size='lg' label='Loading...' />
			</div>
		)
	}

	if (isRostered) {
		return (
			<div className='w-full'>
				<TeamCreationStatusCard isRostered={isRostered} />
			</div>
		)
	}

	return (
		<div className='w-full'>
			<NotificationCard
				title='Create Team'
				description='Create a new team or rollover an existing team for the upcoming season'
				className='max-w-none'
			>
				<TeamCreationFormWrapper
					rolloverMode={rolloverMode}
					onToggleMode={toggleRolloverMode}
					createNewForm={
						<CreateTeamForm
							setNewTeamDocument={setNewTeamDocument}
							handleResult={handleResult}
							seasonId={currentSeasonQueryDocumentSnapshot?.id || ''}
							isTeamRegistrationFull={isTeamRegistrationFull}
						/>
					}
					rolloverForm={
						<RolloverTeamForm
							setNewTeamDocument={setNewTeamDocument}
							handleResult={handleResult}
							seasonId={currentSeasonQueryDocumentSnapshot?.id || ''}
							isTeamRegistrationFull={isTeamRegistrationFull}
						/>
					}
				/>
			</NotificationCard>
		</div>
	)
}
