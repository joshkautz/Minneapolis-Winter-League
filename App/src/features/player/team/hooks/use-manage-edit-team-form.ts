import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { editTeamViaFunction } from '@/firebase/collections/functions'
import { fileToBase64, logger, errorMessage } from '@/shared/utils'
import type { FormResult } from '@/shared/types'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { useSeasonsContext } from '@/providers'
import { useTeamManagement } from './use-team-management'

interface UseManageEditTeamFormProps {
	handleResult: (result: FormResult) => void
}

/**
 * Custom hook for manage edit team form logic
 *
 * Encapsulates form validation, file handling, team data loading, and team update logic.
 */
export const useManageEditTeamForm = ({
	handleResult,
}: UseManageEditTeamFormProps) => {
	const { team } = useTeamManagement()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const seasonId = currentSeasonQueryDocumentSnapshot?.id
	// `team.id` is the seasonId on a teamSeasons subdoc; derive the canonical
	// team id for backend calls.
	const canonicalTeamId = team
		? canonicalTeamIdFromTeamSeasonDoc(team)
		: undefined
	// Already checked against the upload rules by ImageField.
	const [blob, setBlob] = useState<File>()
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

	const form = useForm<TeamFormData>({
		resolver: standardSchemaResolver(teamFormSchema),
		defaultValues: { name: '', logo: '' },
	})

	// Set the team name in the form when team data loads
	useEffect(() => {
		if (team?.data().name) {
			form.setValue('name', team?.data().name)
		}
	}, [team, form])

	const onSubmit = useCallback(
		async (data: TeamFormData) => {
			if (isSubmitting) {
				return
			}

			if (!canonicalTeamId || !seasonId) {
				handleResult({
					success: false,
					title: 'Team not found',
					description: 'Unable to find team information',
				})
				return
			}

			setIsSubmitting(true)

			try {
				const result = await editTeamViaFunction({
					teamId: canonicalTeamId,
					seasonId,
					name: data.name,
					logoBlob: blob ? await fileToBase64(blob) : undefined,
					logoContentType: blob?.type,
				})

				handleResult({
					success: true,
					title: 'Changes saved',
					description: result.message,
				})
			} catch (error) {
				logger.error(
					'Team update failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'useManageEditTeamForm',
						teamId: canonicalTeamId,
						teamName: data.name,
					}
				)

				// Handle Firebase Functions errors
				// The server's message says what went wrong; the title is fixed.
				handleResult({
					success: false,
					title: 'Team update failed',
					description: errorMessage(
						error,
						'Your team could not be saved. Please try again.'
					),
				})
			} finally {
				setIsSubmitting(false)
			}
		},
		[
			isSubmitting,
			setIsSubmitting,
			blob,
			canonicalTeamId,
			seasonId,
			handleResult,
		]
	)

	return {
		form,
		onSubmit,
		handleLogoChange: setBlob,
		blob,
		isSubmitting,
		team,
	}
}
