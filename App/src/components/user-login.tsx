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

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string(),
})

type LoginSchema = z.infer<typeof loginSchema>

export const UserLogin = ({
	closeMobileSheet,
	setIsForgotPasswordOpen,
}: {
	closeMobileSheet?: () => void
	setIsForgotPasswordOpen: React.Dispatch<React.SetStateAction<boolean>>
}) => {
	const { signInWithEmailAndPassword, signInWithEmailAndPasswordError } =
		useAuthContext()
	const form = useForm<LoginSchema>({
		resolver: zodResolver(loginSchema),
	})

	const onSubmit = async (data: LoginSchema) => {
		const res = await signInWithEmailAndPassword(data.email, data.password)

		if (res?.user) {
			toast.success('Login successful!', {
				description: 'Welcome back',
			})
		} else {
			toast.error(`Login failed: ${signInWithEmailAndPasswordError}`, {
				description: 'Invalid email or password',
			})
		}

		if (res?.user && closeMobileSheet) {
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
				<FormField
					control={form.control}
					name={'password'}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Password</FormLabel>
							<FormControl>
								<Input
									type={'password'}
									placeholder={'Password'}
									{...field}
									value={field.value ?? ''}
									autoComplete="current-password"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button type={'submit'}>Login</Button>

				<Button variant={'link'} onClick={() => setIsForgotPasswordOpen(true)}>
					Forgot Password?
				</Button>
			</form>
		</Form>
	)
}
