import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface TeamCreationToggleProps {
	rolloverMode: boolean
	onToggle: () => void
}

/**
 * Toggle switch for choosing between creating new team or rolling over existing team
 */
export const TeamCreationToggle = ({ rolloverMode, onToggle }: TeamCreationToggleProps) => {
	return (
		<div className="flex items-center space-x-2">
			<Switch
				id="rollover"
				checked={rolloverMode}
				onCheckedChange={onToggle}
			/>
			<Label htmlFor="rollover">Rollover past team</Label>
		</div>
	)
}
