import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { editTeamViaFunction } from '@/firebase/collections/functions'
import { logger } from '@/shared/utils'
import { useTeamManagement } from './use-team-management'

interface UseManageEditTeamFormProps {
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

/**
 * Custom hook for manage edit team form logic
 *
 * Encapsulates form validation, file handling, team data loading, and team update logic.
 */
export const useManageEditTeamForm = ({
	handleResult,
}: UseManageEditTeamFormProps) => {
	const { team } = useTeamManagement()
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

			if (!team?.id) {
				handleResult({
					success: false,
					title: 'Team not found',
					description: 'Unable to find team information',
					navigation: false,
				})
				return
			}

			setIsSubmitting(true)

			try {
				// Convert blob to base64 if present
				let logoBlob: string | undefined
				let logoContentType: string | undefined

				if (blob) {
					logoContentType = blob.type
					// Convert File/Blob to base64
					const reader = new FileReader()
					const base64Promise = new Promise<string>((resolve, reject) => {
						reader.onload = () => {
							const result = reader.result as string
							// Remove the data:image/xxx;base64, prefix
							const base64 = result.split(',')[1]
							resolve(base64)
						}
						reader.onerror = reject
					})
					reader.readAsDataURL(blob)
					logoBlob = await base64Promise
				}

				// Call Firebase Function to update team
				const result = await editTeamViaFunction({
					teamId: team.id,
					name: data.name,
					logoBlob,
					logoContentType,
				})

				handleResult({
					success: true,
					title: 'Changes saved',
					description: result.message,
					navigation: false, // Don't navigate, just close dialog
				})
			} catch (error) {
				logger.error(
					'Team update failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'useManageEditTeamForm',
						teamId: team?.id,
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
					navigation: false,
				})
			} finally {
				setIsSubmitting(false)
			}
		},
		[isSubmitting, setIsSubmitting, blob, team, handleResult]
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
