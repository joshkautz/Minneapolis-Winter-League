import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { QueryDocumentSnapshot } from '@/firebase/firestore'
import { TeamDocument, errorHandler, logger } from '@/shared/utils'
import type { TeamCreationData } from '@/features/create/hooks/use-team-creation'

interface RolloverTeamFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
	handleResult: ({
		success,
		title,
		description,
		navigation,
	}: {
		success: boolean
		title: string
		description: string
		navigation: boolean
	}) => void
}

export const RolloverTeamForm = ({
	isSubmitting,
	setIsSubmitting,
	setNewTeamDocument,
	handleResult,
}: RolloverTeamFormProps) => {
	const {
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
	} = useTeamsContext()
	const { seasonsQuerySnapshot } = useSeasonsContext()

	const [stringValue, setStringValue] = useState<string>('')

	const [
		selectedTeamQueryDocumentSnapshot,
		setSelectedTeamQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<TeamDocument> | undefined>(undefined)

	useEffect(() => {
		const defaultTeamQueryDocumentSnapshot =
			teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs
				.sort((a, b) => {
					const seasonsQuerySnapshots = seasonsQuerySnapshot?.docs
					if (seasonsQuerySnapshots) {
						const seasonA = seasonsQuerySnapshots.find(
							(seasonQueryDocumentSnapshot) =>
								seasonQueryDocumentSnapshot.id === a.data().season.id
						)
						const seasonB = seasonsQuerySnapshots.find(
							(seasonQueryDocumentSnapshot) =>
								seasonQueryDocumentSnapshot.id === b.data().season.id
						)
						if (seasonA && seasonB) {
							return (
								seasonA.data()?.dateStart.seconds -
								seasonB.data()?.dateStart.seconds
							)
						}
						return 0
					}
					return 0
				})
				.find((team) => team)

		const defaultTeamHasBeenRolledOver =
			currentSeasonTeamsQuerySnapshot?.docs.some(
				(teamQueryDocumentSnapshot) =>
					teamQueryDocumentSnapshot.data().teamId ===
					defaultTeamQueryDocumentSnapshot?.data().teamId
			)

		if (
			!defaultTeamHasBeenRolledOver &&
			defaultTeamQueryDocumentSnapshot?.data().name
		) {
			setStringValue(defaultTeamQueryDocumentSnapshot.data().name)
			setSelectedTeamQueryDocumentSnapshot(defaultTeamQueryDocumentSnapshot)
		}
	}, [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		seasonsQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
		setStringValue,
		setSelectedTeamQueryDocumentSnapshot,
	])

	const onRolloverSubmit = useCallback(async () => {
		try {
			setIsSubmitting(true)
			setNewTeamDocument({
				name: selectedTeamQueryDocumentSnapshot?.data().name,
				storageRef: undefined, // Not needed for rollover scenarios
				teamId: selectedTeamQueryDocumentSnapshot?.data().teamId,
			})
		} catch (error) {
			logger.error(
				'Team rollover failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'RolloverTeamForm',
					teamId: selectedTeamQueryDocumentSnapshot?.data().teamId,
				}
			)

			errorHandler.handleValidation(error, 'rollover-team-form', {
				fallbackMessage: 'Failed to rollover team. Please try again.',
			})
		} finally {
			setIsSubmitting(false)
		}
	}, [
		selectedTeamQueryDocumentSnapshot,
		setNewTeamDocument,
		handleResult,
		setIsSubmitting,
	])

	const handleSeasonChange = useCallback(
		(team: string) => {
			setStringValue(team)
			const teamQueryDocumentSnapshot =
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs.find(
					(teamQueryDocumentSnapshot) =>
						teamQueryDocumentSnapshot.data().name === team
				)
			setSelectedTeamQueryDocumentSnapshot(teamQueryDocumentSnapshot)
		},
		[
			setStringValue,
			setSelectedTeamQueryDocumentSnapshot,
			teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		]
	)

	return (
		<div className='w-full'>
			{!teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot ? (
				<div className='text-center py-8'>
					<p className='text-muted-foreground'>
						No previous teams available for rollover
					</p>
					<p className='text-sm text-muted-foreground mt-2'>
						You haven't captained any teams in previous seasons
					</p>
				</div>
			) : (
				<div className='space-y-6'>
					<div className='space-y-3'>
						<Label className='text-sm font-medium'>
							Teams You've Captained
						</Label>
						<Select value={stringValue} onValueChange={handleSeasonChange}>
							<SelectTrigger
								className='w-full h-11 justify-between min-h-11'
								aria-label='Select a team to rollover'
							>
								<div className='flex-1 text-center'>
									<SelectValue placeholder='Select a previous team to rollover' />
								</div>
							</SelectTrigger>
							<SelectContent>
								{teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs
									.sort((a, b) => {
										const docs = seasonsQuerySnapshot?.docs
										if (docs) {
											const seasonA = docs.find(
												(season) => season.id === a.data().season.id
											)
											const seasonB = docs.find(
												(season) => season.id === b.data().season.id
											)
											if (seasonA && seasonB) {
												return (
													seasonB.data()?.dateStart.seconds -
													seasonA.data()?.dateStart.seconds
												)
											}
											return 0
										}
										return 0
									})
									.map((team) => {
										const teamHasBeenRolledOver =
											currentSeasonTeamsQuerySnapshot?.docs.some(
												(teamQueryDocumentSnapshot) =>
													teamQueryDocumentSnapshot.data().teamId ===
													team.data().teamId
											)
										const seasonQueryDocumentSnapshot =
											seasonsQuerySnapshot?.docs.find(
												(season) => season.id === team.data().season.id
											)

										return (
											<SelectItem
												key={team.id}
												value={team.data().name}
												disabled={teamHasBeenRolledOver}
												className='justify-center'
											>
												<div className='flex flex-col items-center text-center w-full'>
													<span className='font-medium'>
														{team.data().name}
													</span>
													<span className='text-xs text-muted-foreground'>
														{seasonQueryDocumentSnapshot?.data().name}
														{teamHasBeenRolledOver && ' (Already Rolled Over)'}
													</span>
												</div>
											</SelectItem>
										)
									})}
							</SelectContent>
						</Select>
					</div>

					<div className='pt-2'>
						<Button
							type='submit'
							onClick={onRolloverSubmit}
							disabled={isSubmitting || !selectedTeamQueryDocumentSnapshot}
							className='w-full h-11'
							size='lg'
						>
							{isSubmitting ? 'Rolling Over Team...' : 'Rollover Existing Team'}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
