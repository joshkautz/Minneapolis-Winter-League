import { ReloadIcon } from '@radix-ui/react-icons'

/**
 * ScheduleLoadingState Component
 *
 * Displays loading state for the schedule page.
 * Extracted from main Schedule component for better organization.
 */
export const ScheduleLoadingState = () => {
	return (
		<div className={'flex absolute inset-0 justify-center items-center'}>
			<ReloadIcon className={'mr-2 w-10 h-10 animate-spin'} />
		</div>
	)
}
