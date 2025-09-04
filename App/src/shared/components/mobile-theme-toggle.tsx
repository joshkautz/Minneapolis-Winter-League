import { useContext } from 'react'
import { ThemeContext } from '@/providers'
import { LaptopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { logger } from '@/shared/utils'
import { Button } from '@/components/ui/button'

/**
 * Mobile-optimized theme toggle component for navigation drawers
 */
export const MobileThemeToggle = () => {
	const themeContext = useContext(ThemeContext)

	if (!themeContext) {
		return null
	}

	const { theme, setTheme } = themeContext

	// Get the stored theme preference (could be 'system')
	const getStoredTheme = (): 'light' | 'dark' | 'system' => {
		const stored = localStorage.getItem('theme')
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			return stored
		}
		return 'system' // Default to system if nothing is stored
	}

	const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
		logger.userAction('theme_changed', 'MobileThemeToggle', {
			theme: newTheme,
			currentTheme: theme,
		})
		setTheme(newTheme)
	}

	const getThemeIcon = () => {
		const storedTheme = getStoredTheme()
		switch (storedTheme) {
			case 'light':
				return (
					<div className='relative w-4 h-4'>
						<SunIcon className='absolute transition-all scale-100 rotate-0 dark:-rotate-90 dark:scale-0 w-4 h-4' />
						<MoonIcon className='absolute transition-all scale-0 rotate-90 dark:rotate-0 dark:scale-100 w-4 h-4' />
					</div>
				)
			case 'dark':
				return (
					<div className='relative w-4 h-4'>
						<SunIcon className='absolute transition-all scale-100 rotate-0 dark:-rotate-90 dark:scale-0 w-4 h-4' />
						<MoonIcon className='absolute transition-all scale-0 rotate-90 dark:rotate-0 dark:scale-100 w-4 h-4' />
					</div>
				)
			case 'system':
				return <LaptopIcon className='w-4 h-4' />
			default:
				return <LaptopIcon className='w-4 h-4' />
		}
	}

	const getThemeLabel = () => {
		const storedTheme = getStoredTheme()
		switch (storedTheme) {
			case 'light':
				return 'Light Mode'
			case 'dark':
				return 'Dark Mode'
			case 'system':
				return 'System Theme'
			default:
				return 'System Theme'
		}
	}

	const cycleTheme = () => {
		const themes: Array<'light' | 'dark' | 'system'> = [
			'light',
			'dark',
			'system',
		]
		const currentStored = getStoredTheme()
		const currentIndex = themes.indexOf(currentStored)
		const nextIndex = (currentIndex + 1) % themes.length
		handleThemeChange(themes[nextIndex])
	}

	return (
		<Button
			onClick={cycleTheme}
			className='w-full h-10 px-3 py-2 text-sm font-normal justify-start hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset cursor-pointer'
			variant='ghost'
			aria-label={`Current theme: ${getThemeLabel()}. Click to cycle through themes.`}
		>
			{getThemeIcon()}
			<span className='ml-2'>{getThemeLabel()}</span>
		</Button>
	)
}
