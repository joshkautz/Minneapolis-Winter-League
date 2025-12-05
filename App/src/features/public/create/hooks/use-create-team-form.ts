import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { StorageReference } from '@/firebase/storage'
import { TeamFormData, teamFormSchema } from '@/shared/utils/validation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { createTeamViaFunction } from '@/firebase/collections/functions'
import { logger } from '@/shared/utils'

interface UseCreateTeamFormProps {
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<
			| {
					name: string | undefined
					storageRef: StorageReference | undefined
					teamId: string | undefined
			  }
			| undefined
		>
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
 * Custom hook for create team form logic
 *
 * Encapsulates form validation, file handling, and team creation logic.
 */
export const useCreateTeamForm = ({
	setNewTeamDocument,
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

				// Call Firebase Function to create team
				const result = await createTeamViaFunction({
					name: data.name,
					logoBlob,
					logoContentType,
					seasonId,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})

				// Set the team document for any subsequent processing
				setNewTeamDocument({
					name: data.name,
					storageRef: undefined, // Not needed since server handles upload
					teamId: result.teamId,
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
		[
			isSubmitting,
			setIsSubmitting,
			blob,
			setNewTeamDocument,
			handleResult,
			seasonId,
		]
	)

	return {
		form,
		onSubmit,
		handleFileChange,
		blob,
		isSubmitting,
	}
}
