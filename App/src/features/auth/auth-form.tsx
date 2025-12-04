import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'
import { ResetPasswordForm } from './reset-password-form'

interface AuthFormProps {
	onSuccess: () => void
}

export const AuthForm = ({ onSuccess }: AuthFormProps) => {
	const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login')
	const [showResetPassword, setShowResetPassword] = useState(false)

	const handleNameAppeal = (data: {
		firstName: string
		lastName: string
		email: string
	}) => {
		// Show message using a modal or toast instead of alert
		// This is intentionally a no-op since name appeals should be handled by the form
		void data
	}

	if (showResetPassword) {
		return (
			<ResetPasswordForm
				onSuccess={onSuccess}
				onBack={() => setShowResetPassword(false)}
			/>
		)
	}

	return (
		<Tabs
			value={activeTab}
			onValueChange={(value) => setActiveTab(value as 'login' | 'signup')}
			className='w-full'
		>
			<TabsList className='grid w-full grid-cols-2'>
				<TabsTrigger value='login'>Log In</TabsTrigger>
				<TabsTrigger value='signup'>Sign Up</TabsTrigger>
			</TabsList>
			<TabsContent value='login'>
				<LoginForm
					onSuccess={onSuccess}
					onForgotPassword={() => setShowResetPassword(true)}
				/>
			</TabsContent>
			<TabsContent value='signup'>
				<SignupForm onSuccess={onSuccess} onNameAppeal={handleNameAppeal} />
			</TabsContent>
		</Tabs>
	)
}
