import { GradientHeader } from '@/shared/components'
import { useScheduleData } from '@/shared/hooks/use-schedule-data'
import { ScheduleGrid } from './schedule-grid'
import { ScheduleLoadingState } from './schedule-loading-state'
import { ScheduleEmptyState } from './schedule-empty-state'

/**
 * Schedule Component
 *
 * Main schedule page component that displays game schedules organized by rounds.
 * Refactored to use smaller, focused components and custom hooks for better maintainability.
 */
export const Schedule = () => {
	const { isLoading, hasGames } = useScheduleData()

	return (
		<div className={'sm:container'}>
			<GradientHeader>Schedule</GradientHeader>

			{isLoading ? (
				<ScheduleLoadingState />
			) : !hasGames ? (
				<ScheduleEmptyState />
			) : (
				<ScheduleGrid />
			)}
		</div>
	)
}
