import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useAuthContext } from '@/contexts/auth-context'

const passwordResetEmailSchema = z.object({
	email: z.string().email(),
})

type PasswordResetEmailSchema = z.infer<typeof passwordResetEmailSchema>

export const ResetPassword = ({
	closeMobileSheet,
	setIsForgotPasswordOpen,
}: {
	closeMobileSheet?: () => void
	setIsForgotPasswordOpen: React.Dispatch<React.SetStateAction<boolean>>
}) => {
	const { sendPasswordResetEmail, sendPasswordResetEmailError } =
		useAuthContext()

	const form = useForm<PasswordResetEmailSchema>({
		resolver: zodResolver(passwordResetEmailSchema),
	})

	const onSubmit = async (data: PasswordResetEmailSchema) => {
		const res = await sendPasswordResetEmail(data.email)

		if (res) {
			toast.success('Password reset email sent', {
				description: 'Check your inbox!',
			})
		} else {
			toast.error(
				`Password reset email failed: ${sendPasswordResetEmailError}`,
				{
					description: `${sendPasswordResetEmailError?.message}`,
				}
			)
		}

		if (res && closeMobileSheet) {
			closeMobileSheet()
		}
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className={'w-full space-y-6'}
			>
				<FormField
					control={form.control}
					name={'email'}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input
									placeholder={'Email'}
									{...field}
									value={field.value ?? ''}
									autoComplete="email"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Button type={'submit'}>Reset Password</Button>

				<Button
					variant={'link'}
					onClick={(event) => {
						event.preventDefault()
						setIsForgotPasswordOpen(false)
					}}
				>
					Back
				</Button>
			</form>
		</Form>
	)
}
