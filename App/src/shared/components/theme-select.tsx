import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useContext, useEffect, useState } from 'react'
import { ThemeContext } from '@/providers'
import { cn } from '@/shared/utils'
import { logger } from '@/shared/utils'
import { LaptopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { useAnimatedSelect } from '@/shared/hooks'

const themeOptions = [
	{ value: 'light', label: 'Light', icon: SunIcon },
	{ value: 'dark', label: 'Dark', icon: MoonIcon },
	{ value: 'system', label: 'System', icon: LaptopIcon },
] as const

export const ThemeSelect = ({ mobile = false }: { mobile?: boolean }) => {
	const themeContext = useContext(ThemeContext)
	const [stringValue, setStringValue] = useState<string>('')
	const [initialSelection, setInitialSelection] = useState<boolean>(false)

	if (!themeContext) {
		return null
	}

	const { setTheme } = themeContext

	// Get the stored theme preference (including 'system')
	const getStoredTheme = (): 'light' | 'dark' | 'system' => {
		const stored = localStorage.getItem('theme')
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			return stored
		}
		return 'system' // Default to system if nothing is stored
	}

	// Use the animated select hook
	const { handleAnimatedChange, getTransitionClasses, getIconClasses } =
		useAnimatedSelect({
			onValueChange: (theme: string) => {
				const newTheme = theme as 'light' | 'dark' | 'system'
				setStringValue(theme)
				logger.userAction('theme_changed', 'ThemeSelect', { theme: newTheme })
				setTheme(newTheme)
			},
		})

	const handleThemeChange = (theme: string) => {
		handleAnimatedChange(theme)
	}

	useEffect(() => {
		if (!initialSelection) {
			const currentTheme = getStoredTheme()
			setStringValue(currentTheme)
			setInitialSelection(true)
		}
	}, [])

	const getCurrentThemeOption = () => {
		return themeOptions.find((option) => option.value === stringValue)
	}

	return (
		<div className='w-full'>
			<Select value={stringValue} onValueChange={handleThemeChange}>
				<SelectTrigger
					className={cn(
						'w-full px-3 hover:bg-accent dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:[&_svg]:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset rounded-md cursor-pointer',
						mobile ? '!h-10' : '!h-9'
					)}
				>
					<SelectValue placeholder='Select theme'>
						{stringValue && getCurrentThemeOption() && (
							<div
								className={cn(
									'flex items-center gap-2',
									getTransitionClasses()
								)}
							>
								{(() => {
									const IconComponent = getCurrentThemeOption()!.icon
									return (
										<IconComponent
											className={cn('w-4 h-4', getIconClasses())}
										/>
									)
								})()}
								<span>{getCurrentThemeOption()!.label}</span>
							</div>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{themeOptions.map((option) => {
						const IconComponent = option.icon
						return (
							<SelectItem
								key={option.value}
								value={option.value}
								className='hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors duration-200 focus:outline-none'
							>
								<div className='flex items-center gap-2'>
									<IconComponent className='w-4 h-4 transition-transform duration-150 hover:scale-105' />
									<span>{option.label}</span>
								</div>
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
		</div>
	)
}
