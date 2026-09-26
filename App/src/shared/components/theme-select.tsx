import { LaptopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useThemeContext, type ThemePreference } from '@/providers'
import { cn, logger } from '@/shared/utils'
import { useAnimatedSelect } from '@/shared/hooks'

const themeOptions = [
	{ value: 'light', label: 'Light', icon: SunIcon },
	{ value: 'dark', label: 'Dark', icon: MoonIcon },
	{ value: 'system', label: 'System', icon: LaptopIcon },
] as const

export const ThemeSelect = ({ mobile = false }: { mobile?: boolean }) => {
	const { preference, setPreference } = useThemeContext()

	const { handleAnimatedChange, getTransitionClasses, getIconClasses } =
		useAnimatedSelect({
			onValueChange: (value: string) => {
				const next = value as ThemePreference
				logger.userAction('theme_changed', 'ThemeSelect', { theme: next })
				setPreference(next)
			},
		})

	const currentOption = themeOptions.find(
		(option) => option.value === preference
	)

	return (
		<div className='w-full'>
			<Select value={preference} onValueChange={handleAnimatedChange}>
				<SelectTrigger
					className={cn(
						'w-full px-3 hover:bg-accent dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:[&_svg]:text-accent-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:ring-inset rounded-md cursor-pointer',
						mobile ? '!h-10' : '!h-9'
					)}
				>
					<SelectValue placeholder='Select theme'>
						{currentOption && (
							<div
								className={cn(
									'flex items-center gap-2',
									getTransitionClasses()
								)}
							>
								<currentOption.icon
									className={cn('w-4 h-4', getIconClasses())}
								/>
								<span>{currentOption.label}</span>
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
								className='transition-colors duration-200'
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
