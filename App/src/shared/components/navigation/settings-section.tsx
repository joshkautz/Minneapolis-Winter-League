import { SeasonSelect } from '../season-select'
import { ThemeToggle } from '../theme-toggle'

/**
 * Desktop settings section with season select and theme toggle
 */
export const SettingsSection = () => {
	return (
		<div className='flex items-center gap-4'>
			<SeasonSelect />
			<ThemeToggle />
		</div>
	)
}
