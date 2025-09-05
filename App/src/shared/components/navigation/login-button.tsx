import { Button } from '@/components/ui/button'

interface LoginButtonProps {
	onLoginClick: () => void
}

/**
 * Login button component for unauthenticated users
 */
export const LoginButton = ({ onLoginClick }: LoginButtonProps) => {
	return (
		<Button variant='default' onClick={onLoginClick}>
			Log In
		</Button>
	)
}
