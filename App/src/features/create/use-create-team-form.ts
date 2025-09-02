import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { StorageReference, ref, storage } from '@/firebase/storage'
import { TeamFormData } from '@/shared/utils/validation'
interface UseCreateTeamFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
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
	uploadFile: (
		ref: StorageReference,
		blob: Blob,
		metadata: { contentType: string }
	) => Promise<{ ref: StorageReference } | undefined>
}

/**
 * Custom hook for create team form logic
 *
 * Encapsulates form validation, file handling, and team creation logic.
 */
export const useCreateTeamForm = ({
	isSubmitting,
	setIsSubmitting,
	setNewTeamDocument,
	handleResult,
	uploadFile,
}: UseCreateTeamFormProps) => {
	const [blob, setBlob] = useState<Blob>()

	const form = useForm<TeamFormData>({
		defaultValues: {
			name: '',
			logo: '',
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
				const teamId = uuidv4()
				let storageRef: StorageReference | undefined

				if (blob) {
					const fileRef = ref(storage, `logos/${teamId}`)
					const result = await uploadFile(fileRef, blob, {
						contentType: blob.type,
					})
					storageRef = result?.ref
				}

				setNewTeamDocument({
					name: data.name,
					storageRef,
					teamId,
				})

				handleResult({
					success: true,
					title: 'Team creation initiated',
					description: 'Please proceed to complete team registration',
					navigation: true,
				})
			} catch (error) {
				console.error('Create team error:', error)
				handleResult({
					success: false,
					title: 'Team creation failed',
					description: 'An error occurred while creating the team',
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
			uploadFile,
		]
	)

	return {
		form,
		onSubmit,
		handleFileChange,
		blob,
	}
}
