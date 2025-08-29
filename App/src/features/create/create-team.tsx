import React from 'react'
import { ReloadIcon } from '@radix-ui/react-icons'
import { GradientHeader } from '@/shared/components'
import { CreateTeamForm } from './create-team-form'
import { RolloverTeamForm } from './rollover-team-form'
import { TeamCreationStatusCard, TeamCreationFormWrapper } from './components'
import { useTeamCreation } from './hooks'

export const CreateTeam: React.FC = () => {
	const {
		rolloverMode,
		isSubmitting,
		isLoading,
		isAdmin,
		isRostered,
		isRegistrationOpen,
		currentSeasonQueryDocumentSnapshot,
		setNewTeamDocument,
		setIsSubmitting,
		handleResult,
		toggleRolloverMode,
	} = useTeamCreation()

	if (isLoading || isSubmitting) {
		return (
			<div className='container flex flex-col items-center md:min-h-[calc(100vh-60px)] gap-10'>
				<div className='absolute inset-0 flex items-center justify-center'>
					<ReloadIcon className='mr-2 h-10 w-10 animate-spin' />
				</div>
			</div>
		)
	}

	if (isRostered || (!isRegistrationOpen && !isAdmin)) {
		const registrationStartDate =
			currentSeasonQueryDocumentSnapshot?.data()?.registrationStart

		return (
			<div className='container flex flex-col items-center md:min-h-[calc(100vh-60px)] gap-10'>
				<TeamCreationStatusCard
					isRostered={isRostered}
					isRegistrationOpen={isRegistrationOpen}
					{...(registrationStartDate && { registrationStartDate })}
				/>
			</div>
		)
	}

	return (
		<div className='container flex flex-col items-center md:min-h-[calc(100vh-60px)] gap-10'>
			<GradientHeader>Create a Team</GradientHeader>

			<TeamCreationFormWrapper
				rolloverMode={rolloverMode}
				onToggleMode={toggleRolloverMode}
			>
				{rolloverMode ? (
					<RolloverTeamForm
						isSubmitting={isSubmitting}
						setIsSubmitting={setIsSubmitting}
						setNewTeamDocument={setNewTeamDocument}
						handleResult={handleResult}
					/>
				) : (
					<CreateTeamForm
						isSubmitting={isSubmitting}
						setIsSubmitting={setIsSubmitting}
						setNewTeamDocument={setNewTeamDocument}
						handleResult={handleResult}
					/>
				)}
			</TeamCreationFormWrapper>
		</div>
	)
}
