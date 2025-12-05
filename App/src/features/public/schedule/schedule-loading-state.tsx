import { LoadingSpinner } from '@/shared/components'

/**
 * ScheduleLoadingState Component
 *
 * Displays loading state for the schedule page.
 * Extracted from main Schedule component for better organization.
 */
export const ScheduleLoadingState = () => {
	return (
		<div className={'flex absolute inset-0 justify-center items-center'}>
			<LoadingSpinner size='lg' />
		</div>
	)
}
