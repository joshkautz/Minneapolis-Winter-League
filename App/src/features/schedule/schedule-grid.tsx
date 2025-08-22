import { ScheduleCard } from './schedule-card'
import { useScheduleData } from '@/shared/hooks/use-schedule-data'

/**
 * ScheduleGrid Component
 * 
 * Renders the grid of schedule cards for all game rounds.
 * Extracted from main Schedule component for better organization.
 */
export const ScheduleGrid = () => {
	const { rounds, generateRoundTitle } = useScheduleData()

	return (
		<div className={'flex flex-wrap gap-8'}>
			{rounds.map((games, index) => (
				<ScheduleCard
					key={`schedule-card-${index}`}
					games={games}
					title={generateRoundTitle(index)}
				/>
			))}
		</div>
	)
}
