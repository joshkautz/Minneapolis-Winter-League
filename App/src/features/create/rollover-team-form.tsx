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
		<div className='inline-flex items-start justify-start w-full space-x-2'>
			{!teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot ? (
				<p>No previous teams eligible for rollover</p>
			) : (
				<div className='flex flex-col space-y-6'>
					<div className='space-y-2'>
						<Label>{`Teams you've captained in the past`}</Label>
						<Select value={stringValue} onValueChange={handleSeasonChange}>
							<SelectTrigger>
								<SelectValue placeholder={'Select a previous team'} />
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
													seasonA.data()?.dateStart.seconds -
													seasonB.data()?.dateStart.seconds
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
											>
												{!teamHasBeenRolledOver
													? `${team.data().name} - ${seasonQueryDocumentSnapshot?.data().name}`
													: `${team.data().name} - ${seasonQueryDocumentSnapshot?.data().name} (Already Rolled Over)`}
											</SelectItem>
										)
									})}
							</SelectContent>
						</Select>
					</div>
					<Button
						type={'submit'}
						onClick={onRolloverSubmit}
						disabled={
							isSubmitting || !selectedTeamQueryDocumentSnapshot || true
						}
					>
						Rollover
					</Button>
					<p
						className={'text-[0.8rem] text-muted-foreground mt-2 text-red-500'}
					>
						The maximum number of fully registered teams for the current season
						has been reached.
					</p>
				</div>
			)}
		</div>
	)
}
