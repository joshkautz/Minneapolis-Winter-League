import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface TeamCreationToggleProps {
	rolloverMode: boolean
	onToggle: () => void
}

/**
 * Toggle switch for choosing between creating new team or rolling over existing team
 */
export const TeamCreationToggle = ({
	rolloverMode,
	onToggle,
}: TeamCreationToggleProps) => {
	return (
		<div className='flex items-center space-x-3 bg-muted/30 rounded-lg px-3 py-2'>
			<Label
				htmlFor='rollover-toggle'
				className='text-sm font-medium cursor-pointer select-none'
			>
				{rolloverMode ? 'Rollover Mode' : 'Create New'}
			</Label>
			<Switch
				id='rollover-toggle'
				checked={rolloverMode}
				onCheckedChange={onToggle}
				aria-label={`Switch to ${rolloverMode ? 'create new team' : 'rollover existing team'} mode`}
			/>
		</div>
	)
}
