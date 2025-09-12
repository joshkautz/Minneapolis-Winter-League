import { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { SeparatorWithText } from '@/components/ui/separator-with-text'
import { Settings } from 'lucide-react'
import { SeasonSelect } from '../season-select'
import { ThemeSelect } from '../theme-select'
import { cn } from '@/shared/utils'

interface SettingsSectionProps {
	isOpen: boolean
	setIsOpen: Dispatch<SetStateAction<boolean>>
	forceClose: boolean
}

/**
 * Desktop settings section with a settings button that opens a popover containing season and theme selects
 */
export const SettingsSection = ({
	isOpen,
	setIsOpen,
	forceClose,
}: SettingsSectionProps) => {
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button variant='ghost' size='sm' className='px-0 w-9'>
					<Settings className='h-4 w-4' />
					<span className='sr-only'>Settings</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					'w-80',
					forceClose && '!animate-none !duration-0 !transition-none'
				)}
				align='end'
			>
				<SeparatorWithText>Settings</SeparatorWithText>
				<div className='space-y-4'>
					<div>
						<label className='text-sm font-medium mb-2 block'>Season</label>
						<SeasonSelect />
					</div>
					<div>
						<label className='text-sm font-medium mb-2 block'>Theme</label>
						<ThemeSelect />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
