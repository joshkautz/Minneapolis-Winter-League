import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useContext } from 'react'
import { ThemeContext } from '@/providers'
import { Button } from '@/components/ui/button'
import { LaptopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { logger } from '@/shared/utils'

export const ThemeToggle = () => {
	const themeContext = useContext(ThemeContext)

	if (!themeContext) {
		return null
	}

	const { setTheme } = themeContext

	const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
		logger.userAction('theme_changed', 'ThemeToggle', { theme })
		setTheme(theme)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="px-0 w-9">
					<SunIcon className="transition-all scale-100 rotate-0 dark:-rotate-90 dark:scale-0" />
					<MoonIcon className="absolute transition-all scale-0 rotate-90 dark:rotate-0 dark:scale-100" />
					<span className="sr-only">Toggle theme</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => handleThemeChange('light')}>
					<SunIcon className="w-4 h-4 mr-2" />
					<span>Light</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleThemeChange('dark')}>
					<MoonIcon className="w-4 h-4 mr-2" />
					<span>Dark</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleThemeChange('system')}>
					<LaptopIcon className="w-4 h-4 mr-2" />
					<span>System</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
