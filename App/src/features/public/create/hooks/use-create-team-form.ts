import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { createTeamViaFunction } from '@/firebase/collections/functions'
import { fileToBase64, logger, errorMessage } from '@/shared/utils'
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
	// Already checked against the upload rules by ImageField.
	const [blob, setBlob] = useState<File>()
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

	const form = useForm<TeamFormData>({
		resolver: standardSchemaResolver(teamFormSchema),
		defaultValues: {
			name: '',
		},
	})

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
				// The server's message says what went wrong; the title is fixed.
				handleResult({
					success: false,
					title: 'Team creation failed',
					description: errorMessage(
						error,
						'Your team could not be created. Please try again.'
					),
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
		handleLogoChange: setBlob,
		blob,
		isSubmitting,
	}
}
