import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { QueryDocumentSnapshot } from '@/firebase/firestore'
import { TeamDocument, logger } from '@/shared/utils'
import {
	RolloverTeamFormData,
	rolloverTeamFormSchema,
} from '@/shared/utils/validation'
import { rolloverTeamViaFunction } from '@/firebase/collections/functions'
import { useTeamsContext, useSeasonsContext } from '@/providers'
import type { TeamCreationData } from '@/features/create/hooks/use-team-creation'

interface UseRolloverTeamFormProps {
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
	seasonId: string
}

/**
 * Custom hook for rollover team form logic
 *
 * Encapsulates form validation, team selection, and rollover logic.
 */
export const useRolloverTeamForm = ({
	setNewTeamDocument,
	handleResult,
	seasonId,
}: UseRolloverTeamFormProps) => {
	const {
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
	} = useTeamsContext()
	const { seasonsQuerySnapshot } = useSeasonsContext()

	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
	const [
		selectedTeamQueryDocumentSnapshot,
		setSelectedTeamQueryDocumentSnapshot,
	] = useState<QueryDocumentSnapshot<TeamDocument> | undefined>(undefined)

	const form = useForm<RolloverTeamFormData>({
		resolver: standardSchemaResolver(rolloverTeamFormSchema),
		defaultValues: {
			selectedTeam: '',
		},
	})

	// Auto-select the most recent team that hasn't been rolled over
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
			const teamName = defaultTeamQueryDocumentSnapshot.data().name
			setSelectedTeamQueryDocumentSnapshot(defaultTeamQueryDocumentSnapshot)
			form.setValue('selectedTeam', teamName)
		}
	}, [
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		seasonsQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
		setSelectedTeamQueryDocumentSnapshot,
		form,
	])

	const onSubmit = useCallback(
		async (data: RolloverTeamFormData) => {
			try {
				setIsSubmitting(true)
				// Validate that a team is selected
				if (!selectedTeamQueryDocumentSnapshot || !data.selectedTeam) {
					throw new Error('No team selected')
				}

				// Call Firebase Function to rollover team
				const result = await rolloverTeamViaFunction({
					originalTeamId: selectedTeamQueryDocumentSnapshot.data().teamId,
					seasonId,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})

				// Set the team document for any subsequent processing
				setNewTeamDocument({
					name: selectedTeamQueryDocumentSnapshot.data().name,
					storageRef: undefined, // Not needed for rollover scenarios
					teamId: result.teamId,
				})

				handleResult({
					success: true,
					title: 'Team rolled over successfully',
					description: result.message,
					navigation: true,
				})
			} catch (error) {
				logger.error(
					'Team rollover failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'useRolloverTeamForm',
						teamId: selectedTeamQueryDocumentSnapshot?.data().teamId,
					}
				)

				// Handle Firebase Functions errors
				let errorMessage = 'Failed to rollover team. Please try again.'
				let errorTitle = 'Team rollover failed'

				if (error && typeof error === 'object' && 'message' in error) {
					errorMessage = error.message as string
				} else if (error instanceof Error) {
					errorMessage = error.message
				}

				// Provide more user-friendly titles based on error message
				if (errorMessage.includes('registration is not currently open')) {
					errorTitle = 'Registration Closed'
				} else if (errorMessage.includes('already on a team')) {
					errorTitle = 'Already on Team'
				} else if (errorMessage.includes('already been rolled over')) {
					errorTitle = 'Already Rolled Over'
				} else if (errorMessage.includes('Only captains')) {
					errorTitle = 'Permission Denied'
				}

				handleResult({
					success: false,
					title: errorTitle,
					description: errorMessage,
					navigation: false,
				})
			} finally {
				setIsSubmitting(false)
			}
		},
		[
			selectedTeamQueryDocumentSnapshot,
			setNewTeamDocument,
			handleResult,
			setIsSubmitting,
			seasonId,
		]
	)

	const handleTeamChange = useCallback(
		(team: string) => {
			const teamQueryDocumentSnapshot =
				teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs.find(
					(teamQueryDocumentSnapshot) =>
						teamQueryDocumentSnapshot.data().name === team
				)
			setSelectedTeamQueryDocumentSnapshot(teamQueryDocumentSnapshot)
		},
		[
			setSelectedTeamQueryDocumentSnapshot,
			teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		]
	)

	return {
		form,
		onSubmit,
		handleTeamChange,
		selectedTeamQueryDocumentSnapshot,
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
		seasonsQuerySnapshot,
		isSubmitting,
	}
}
