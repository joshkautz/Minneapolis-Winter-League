import { SeasonSelect } from '../season-select'
import { ThemeToggle } from '../theme-toggle'
import { UserAvatar } from '@/features/auth'

interface UserSectionProps {
	userContent: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

/**
 * Desktop user section with season select, theme toggle, and user avatar
 */
export const UserSection = ({ userContent, onLoginClick }: UserSectionProps) => {
	return (
		<div className="flex items-center justify-end flex-1 gap-4">
			<SeasonSelect />
			<ThemeToggle />
			<UserAvatar
				userContent={userContent}
				onLoginClick={onLoginClick}
			/>
		</div>
	)
}
