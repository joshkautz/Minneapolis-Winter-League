import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserSignup } from './user-signup'
import { UserLogin } from './user-login'
import { useState } from 'react'
import { ResetPasswordCard } from './reset-password-card'

export const UserForm = ({
	closeMobileSheet,
}: {
	closeMobileSheet?: () => void
}) => {
	const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)

	return (
		<>
			{isForgotPasswordOpen ? (
				<ResetPasswordCard
					closeMobileSheet={closeMobileSheet}
					setIsForgotPasswordOpen={setIsForgotPasswordOpen}
				/>
			) : (
				<Tabs defaultValue={'login'} className={'min-w-[340px]'}>
					<TabsList className={'grid w-full grid-cols-2'}>
						<TabsTrigger value={'login'}>Login</TabsTrigger>
						<TabsTrigger value={'signup'}>Sign up</TabsTrigger>
					</TabsList>
					<TabsContent value={'login'}>
						<Card>
							<CardHeader>
								<CardTitle>Login</CardTitle>
								<CardDescription>Welcome back</CardDescription>
							</CardHeader>
							<CardContent>
								<UserLogin
									closeMobileSheet={closeMobileSheet}
									setIsForgotPasswordOpen={setIsForgotPasswordOpen}
								/>
							</CardContent>
						</Card>
					</TabsContent>
					<TabsContent value={'signup'}>
						<Card>
							<CardHeader>
								<CardTitle>Sign up</CardTitle>
								<CardDescription>Create a new account</CardDescription>
							</CardHeader>
							<CardContent>
								<UserSignup closeMobileSheet={closeMobileSheet} />
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			)}
		</>
	)
}
