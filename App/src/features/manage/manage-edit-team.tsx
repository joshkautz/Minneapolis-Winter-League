import { useAuthContext } from '@/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDownloadURL, useUploadFile } from 'react-firebase-hooks/storage'
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { v4 as uuidv4 } from 'uuid'
import { ReloadIcon } from '@radix-ui/react-icons'
import { editTeamViaFunction } from '@/firebase/collections/functions'
import { StorageReference, ref, storage } from '@/firebase/storage'
import { useTeamsContext } from '@/providers'
import { useSeasonsContext } from '@/providers'
import { Skeleton } from '@/components/ui/skeleton'
import { FocusScope } from '@radix-ui/react-focus-scope'
import { logger, errorHandler, ErrorType } from '@/shared/utils'
import { TeamFormData } from '@/shared/utils/validation'
import { PlayerSeason } from '@/types'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { teamFormSchema } from '@/shared/utils/validation'

export const ManageEditTeam = ({
	closeDialog,
}: {
	closeDialog: () => void
}) => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const [isLoading, setIsLoading] = useState(false)
	const [uploadedFile, setUploadedFile] = useState<Blob>()
	const [storageRef, setStorageRef] = useState<StorageReference>()
	const [uploadFile] = useUploadFile()
	const [downloadUrl] = useDownloadURL(storageRef)
	const [editedTeamDocument, setEditedTeamDocument] = useState<{
		name: string
		storageRef: StorageReference | undefined
	}>()

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					authenticatedUserSnapshot
						?.data()
						?.seasons.find(
							(item: PlayerSeason) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[
			authenticatedUserSnapshot,
			currentSeasonTeamsQuerySnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const url = team?.data().logo

	const form = useForm<TeamFormData>({
		resolver: standardSchemaResolver(teamFormSchema),
		defaultValues: { name: '', logo: '' },
	})

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (!e.target.files?.[0]) {
				return
			}
			setUploadedFile(e.target.files[0])
		},
		[setUploadedFile]
	)

	// Set the team name in the form.
	useEffect(() => {
		if (team?.data().name) {
			form.setValue('name', team?.data().name)
		}
	}, [team, form])

	// Use the existing storage path/reference if it exists.
	useEffect(() => {
		const path = team?.data().storagePath
		if (path) {
			setStorageRef(ref(storage, path))
		}
	}, [team, storage, setStorageRef, ref])

	useEffect(() => {
		if (!downloadUrl) {
			return
		}
		if (!editedTeamDocument || !team?.id) {
			return
		}

		const updateTeam = async () => {
			try {
				await editTeamViaFunction({
					teamId: team.id,
					name: editedTeamDocument.name,
					logo: downloadUrl,
					storagePath: editedTeamDocument.storageRef?.fullPath,
				})
				setIsLoading(false)
				toast.success('Team Edited', {
					description: `Changes have been saved, ${editedTeamDocument.name}!`,
				})
				closeDialog()
			} catch (error) {
				setIsLoading(false)
				logger.error(
					'Edit team with logo failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageEditTeam',
						action: 'edit_team_with_logo',
						teamId: team?.id,
					}
				)
				errorHandler.handleFirebase(error, 'edit_team', 'teams', {
					fallbackMessage: 'Failed to save team changes. Please try again.',
				})
			}
		}

		updateTeam()
	}, [downloadUrl, editedTeamDocument, team, setIsLoading])

	const onSubmit = useCallback(
		async (data: TeamFormData) => {
			try {
				setIsLoading(true)
				if (uploadedFile) {
					if (storageRef) {
						uploadFile(storageRef, uploadedFile, {
							contentType: 'image/jpeg',
						}).then((result) => {
							setStorageRef(result?.ref)
							setEditedTeamDocument({
								name: data.name,
								storageRef: result?.ref,
							})
						})
					} else {
						uploadFile(ref(storage, `teams/${uuidv4()}`), uploadedFile, {
							contentType: 'image/jpeg',
						}).then((result) => {
							setStorageRef(result?.ref)
							setEditedTeamDocument({
								name: data.name,
								storageRef: result?.ref,
							})
						})
					}
				} else {
					if (storageRef && team?.id) {
						try {
							await editTeamViaFunction({
								teamId: team.id,
								name: data.name,
							})
							setIsLoading(false)
							toast.success('Team Edited', {
								description: `Changes have been saved, ${data.name}!`,
							})
							closeDialog()
						} catch (error) {
							setIsLoading(false)
							logger.error(
								'Edit team (no file) failed',
								error instanceof Error ? error : new Error(String(error)),
								{
									component: 'ManageEditTeam',
									action: 'edit_team_no_file',
									teamId: team?.id,
								}
							)
							errorHandler.handleFirebase(error, 'edit_team', 'teams', {
								fallbackMessage:
									'Failed to save team changes. Please try again.',
							})
						}
					} else if (team?.id) {
						try {
							await editTeamViaFunction({
								teamId: team.id,
								name: data.name,
							})
							setIsLoading(false)
							toast.success('Team Edited', {
								description: `Changes have been saved, ${data.name}!`,
							})
							closeDialog()
						} catch (error) {
							setIsLoading(false)
							logger.error(
								'Edit team (else case) failed',
								error instanceof Error ? error : new Error(String(error)),
								{
									component: 'ManageEditTeam',
									action: 'edit_team_else',
									teamId: team?.id,
								}
							)
							errorHandler.handleFirebase(error, 'edit_team', 'teams', {
								fallbackMessage:
									'Failed to save team changes. Please try again.',
							})
						}
					}
				}
			} catch (error) {
				setIsLoading(false)
				logger.error(
					'Edit team general error',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageEditTeam',
						action: 'edit_team_catch',
						teamId: team?.id,
					}
				)
				errorHandler.handle(error, ErrorType.UNEXPECTED, 'ManageEditTeam', {
					fallbackMessage:
						'An unexpected error occurred while saving team changes.',
				})
			}
		},
		[
			uploadedFile,
			storageRef,
			uploadFile,
			setIsLoading,
			setEditedTeamDocument,
			uuidv4,
			storage,
			ref,
			setStorageRef,
			toast,
		]
	)

	return (
		<FocusScope asChild loop trapped>
			<div className='max-w-[400px]'>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className={'w-full space-y-6 items-center justify-center'}
					>
						<FormField
							control={form.control}
							name={'name'}
							render={({ field }) => (
								<FormItem>
									<FormLabel>Team name</FormLabel>
									<FormControl>
										<Input
											placeholder={team?.data().name ?? 'Team name'}
											{...field}
											value={field.value ?? ''}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name={'logo'}
							render={({ field }) => (
								<FormItem>
									<FormLabel>Team logo</FormLabel>
									<FormControl>
										<Input
											id='image-upload'
											type={'file'}
											accept='image/*'
											placeholder={'Upload Image'}
											{...field}
											onChange={handleFileChange}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{uploadedFile ? (
							<div className='flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-clip'>
								<img src={URL.createObjectURL(uploadedFile)} />
							</div>
						) : url ? (
							<div className='flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-clip'>
								<img src={url} />
							</div>
						) : (
							<Skeleton className='h-[100px] md:h-[250px] md:w-1/4' />
						)}
						<Button type={'submit'} disabled={isLoading}>
							{isLoading ? (
								<ReloadIcon className={'animate-spin'} />
							) : (
								`Save changes`
							)}
						</Button>
					</form>
				</Form>
			</div>
		</FocusScope>
	)
}
