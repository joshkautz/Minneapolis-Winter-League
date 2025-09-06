import { Button } from '@/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Settings } from 'lucide-react'
import { SeasonSelect } from '../season-select'
import { ThemeSelect } from '../theme-select'

/**
 * Desktop settings section with a settings button that opens a popover containing season and theme selects
 */
export const SettingsSection = () => {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant='ghost' size='sm' className='px-0 w-9'>
					<Settings className='h-4 w-4' />
					<span className='sr-only'>Settings</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className='w-80' align='end'>
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
