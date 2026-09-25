import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { createTeamViaFunction } from '@/firebase/collections/functions'
import { fileToBase64, logger } from '@/shared/utils'
import type { TeamCreationResult } from './use-team-creation'

interface UseCreateTeamFormProps {
	handleResult: (result: TeamCreationResult) => void
	seasonId: string
}

/**
 * Custom hook for create team form logic
 *
 * Encapsulates form validation, file handling, and team creation logic.
 */
export const useCreateTeamForm = ({
	handleResult,
	seasonId,
}: UseCreateTeamFormProps) => {
	const [blob, setBlob] = useState<Blob>()
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

	const form = useForm<TeamFormData>({
		resolver: standardSchemaResolver(teamFormSchema),
		defaultValues: {
			name: '',
		},
	})

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
			setIsSubmitting(true)

			try {
				const result = await createTeamViaFunction({
					name: data.name,
					logoBlob: blob ? await fileToBase64(blob) : undefined,
					logoContentType: blob?.type,
					seasonId,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})

				handleResult({
					success: true,
					title: 'Team created successfully',
					description: result.message,
					navigation: true,
				})
			} catch (error) {
				logger.error(
					'Team creation failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'useCreateTeamForm',
						teamName: data.name,
						seasonId,
					}
				)

				// Handle Firebase Functions errors
				let errorMessage = 'An error occurred while creating the team'
				let errorTitle = 'Team creation failed'

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
				} else if (errorMessage.includes('Player profile not found')) {
					errorTitle = 'Profile Not Found'
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
		[isSubmitting, setIsSubmitting, blob, handleResult, seasonId]
	)

	return {
		form,
		onSubmit,
		handleFileChange,
		blob,
		isSubmitting,
	}
}
