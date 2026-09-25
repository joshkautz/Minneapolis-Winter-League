import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { editTeamViaFunction } from '@/firebase/collections/functions'
import { fileToBase64, logger } from '@/shared/utils'
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
	const [blob, setBlob] = useState<Blob>()
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

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			if (!event.target.files?.[0]) {
				return
			}
			setBlob(event.target.files[0])
		},
		[setBlob]
	)

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
				let errorMessage = 'Failed to update team. Please try again.'
				let errorTitle = 'Team update failed'

				if (error && typeof error === 'object' && 'message' in error) {
					errorMessage = error.message as string
				} else if (error instanceof Error) {
					errorMessage = error.message
				}

				// Provide more user-friendly titles based on error message
				if (errorMessage.includes('Team not found')) {
					errorTitle = 'Team Not Found'
				} else if (errorMessage.includes('Only team captains')) {
					errorTitle = 'Permission Denied'
				} else if (errorMessage.includes('Only image files')) {
					errorTitle = 'Invalid File Type'
				}

				handleResult({
					success: false,
					title: errorTitle,
					description: errorMessage,
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
		handleFileChange,
		blob,
		isSubmitting,
		team,
	}
}
