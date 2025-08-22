import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StorageReference, ref, storage } from '@/firebase/storage'

const createTeamSchema = z.object({
	logo: z.string().optional(),
	name: z.string().min(2),
})

type CreateTeamSchema = z.infer<typeof createTeamSchema>

interface CreateFormProps {
	isSubmitting: boolean
	setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
	setNewTeamData: React.Dispatch<
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

export const CreateTeamForm = ({
	isSubmitting,
	setIsSubmitting,
	setNewTeamData,
	handleResult,
	uploadFile,
}: CreateFormProps) => {
	const [blob, setBlob] = useState<Blob>()

	const form = useForm<CreateTeamSchema>({
		resolver: zodResolver(createTeamSchema),
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

	const onCreateSubmit = useCallback(
		async (data: CreateTeamSchema) => {
			try {
				setIsSubmitting(true)
				if (blob) {
					uploadFile(ref(storage, `teams/${uuidv4()}`), blob, {
						contentType: 'image/jpeg',
					}).then((result) => {
						setNewTeamData({
							name: data.name,
							storageRef: result?.ref,
							teamId: undefined,
						})
					})
				} else {
					setNewTeamData({
						name: data.name,
						storageRef: undefined,
						teamId: undefined,
					})
				}
			} catch (error) {
				if (error instanceof Error) {
					handleResult({
						success: false,
						title: 'Error',
						description: error.message,
						navigation: false,
					})
				}
			}
		},
		[uploadFile, blob, ref, storage, uuidv4, setNewTeamData, handleResult]
	)

	return (
		<div className="max-w-[400px]">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onCreateSubmit)}
					className={'w-full space-y-6'}
				>
					<FormField
						control={form.control}
						name={'name'}
						render={({ field }) => (
							<FormItem>
								<FormLabel>Team name</FormLabel>
								<FormControl>
									<Input
										placeholder={'Team name'}
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
										id="image-upload"
										type={'file'}
										accept="image/*"
										placeholder={'Upload Image'}
										{...field}
										onChange={handleFileChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type={'submit'} disabled={isSubmitting || true}>
						Create
					</Button>
					<p
						className={'text-[0.8rem] text-muted-foreground mt-2 text-red-500'}
					>
						The maximum number of fully registered teams for the current season
						has been reached.
					</p>
				</form>
			</Form>
		</div>
	)
}
