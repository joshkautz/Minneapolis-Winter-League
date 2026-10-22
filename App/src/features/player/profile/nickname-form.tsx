import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { type DocumentSnapshot } from 'firebase/firestore'
import { Smile } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { LoadingButton } from '@/shared/components'
import { updatePlayerViaFunction } from '@/firebase/collections/functions'
import { displayName, NICKNAME_MAX_LENGTH } from '@/shared/name-rules'
import { errorMessage } from '@/shared/utils'
import {
	nicknameFormSchema,
	type NicknameFormData,
} from '@/shared/utils/validation'
import type { PlayerDocument } from '@/types'

/**
 * The player's optional nickname, shown in quotes between their real names
 * wherever the league shows them. Unlike the real name it can change at
 * any time; blank clears it. It never appears on a waiver.
 */
export const NicknameForm = ({
	authenticatedUserSnapshot,
}: {
	authenticatedUserSnapshot: DocumentSnapshot<PlayerDocument> | undefined
}) => {
	const player = authenticatedUserSnapshot?.data()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const form = useForm<NicknameFormData>({
		resolver: standardSchemaResolver(nicknameFormSchema),
		defaultValues: { nickname: '' },
	})

	const stored = player?.nickname ?? ''
	useEffect(() => {
		form.reset({ nickname: stored })
	}, [stored, form])

	const preview = (
		useWatch({ control: form.control, name: 'nickname' }) ?? ''
	).trim()

	const onSubmit = async ({ nickname }: NicknameFormData) => {
		setIsSubmitting(true)
		try {
			await updatePlayerViaFunction({ nickname: nickname.trim() || null })
			toast.success(nickname.trim() ? 'Nickname saved' : 'Nickname removed')
		} catch (error) {
			toast.error('Nickname not saved', {
				description: errorMessage(
					error,
					'Your nickname could not be saved. Please try again.'
				),
			})
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Card className='h-fit'>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Smile className='h-5 w-5' aria-hidden='true' />
					Nickname
				</CardTitle>
				<CardDescription>
					Shown in quotes between your first and last name. Change it whenever
					you like.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className='w-full space-y-6'
					>
						<FormField
							control={form.control}
							name='nickname'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nickname</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder='Optional'
											maxLength={NICKNAME_MAX_LENGTH}
										/>
									</FormControl>
									<FormDescription>
										{player
											? `You'll appear as ${displayName({
													firstname: player.firstname,
													lastname: player.lastname,
													nickname: preview || null,
												})}.`
											: 'Leave blank for none.'}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<LoadingButton
							disabled={!form.formState.isDirty}
							type='submit'
							loading={isSubmitting}
							loadingText='Saving...'
						>
							Save Nickname
						</LoadingButton>
					</form>
				</Form>
			</CardContent>
		</Card>
	)
}
