import { useScheduleData } from '@/shared/hooks/use-schedule-data'
import { ScheduleGrid } from './schedule-grid'
import { ScheduleLoadingState } from './schedule-loading-state'
import { ScheduleEmptyState } from './schedule-empty-state'
import { Calendar } from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'

/**
 * Schedule Component
 *
 * Main schedule page component that displays game schedules organized by rounds.
 * Refactored to use smaller, focused components and custom hooks for better maintainability.
 */
export const Schedule = () => {
	const { isLoading, hasGames } = useScheduleData()

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Schedule'
				description='View all games and match schedules organized by rounds'
				icon={Calendar}
			/>

			{isLoading ? (
				<ScheduleLoadingState />
			) : !hasGames ? (
				<ScheduleEmptyState />
			) : (
				<ScheduleGrid />
			)}
		</PageContainer>
	)
}
