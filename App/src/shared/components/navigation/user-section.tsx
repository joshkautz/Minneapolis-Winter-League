import { SettingsSection } from './settings-section'
import { AccountSection } from './account-section'

interface UserSectionProps {
	userContent: Array<{ label: string; path: string; alt: string }>
	onLoginClick: () => void
}

/**
 * Desktop user section with settings and account components
 */
export const UserSection = ({
	userContent,
	onLoginClick,
}: UserSectionProps) => {
	return (
		<div className='flex items-center justify-end flex-1 gap-4'>
			<SettingsSection />
			<AccountSection userContent={userContent} onLoginClick={onLoginClick} />
		</div>
	)
}
