import { useScheduleData } from '@/shared/hooks/use-schedule-data'
import { ScheduleGrid } from './schedule-grid'
import { ScheduleLoadingState } from './schedule-loading-state'
import { ScheduleEmptyState } from './schedule-empty-state'
import { Calendar } from 'lucide-react'

/**
 * Schedule Component
 *
 * Main schedule page component that displays game schedules organized by rounds.
 * Refactored to use smaller, focused components and custom hooks for better maintainability.
 */
export const Schedule = () => {
	const { isLoading, hasGames } = useScheduleData()

	return (
		<div className='container mx-auto px-4 py-8 space-y-6'>
			{/* Header */}
			<div className='text-center space-y-4'>
				<h1 className='text-3xl font-bold flex items-center justify-center gap-3'>
					<Calendar className='h-8 w-8' />
					Schedule
				</h1>
				<p className='text-muted-foreground'>
					View all games and match schedules organized by rounds
				</p>
			</div>

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
