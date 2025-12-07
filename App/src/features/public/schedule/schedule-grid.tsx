import { ScheduleCard } from './schedule-card'
import { useScheduleData } from '@/shared/hooks/use-schedule-data'

/**
 * ScheduleGrid Component
 *
 * Renders the grid of schedule cards for all game rounds.
 * Displays upcoming games at the top and completed games at the bottom when there are upcoming games.
 * Otherwise displays all games in ascending order.
 */
export const ScheduleGrid = () => {
	const { rounds, upcomingRounds, completedRounds, generateRoundTitle } =
		useScheduleData()

	// If there are no upcoming games, render all games in ascending order (original behavior)
	if (upcomingRounds.length === 0) {
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

	// When there are upcoming games, show two sections
	return (
		<div className={'flex flex-col gap-12'}>
			{/* Upcoming Games Section */}
			<div className={'flex flex-col gap-4'}>
				<h2 className={'text-2xl font-semibold'}>Upcoming Games</h2>
				<div className={'flex flex-wrap gap-8'}>
					{upcomingRounds.map(({ round, originalIndex }) => (
						<ScheduleCard
							key={`upcoming-schedule-card-${originalIndex}`}
							games={round}
							title={generateRoundTitle(originalIndex)}
						/>
					))}
				</div>
			</div>

			{/* Completed Games Section */}
			<div className={'flex flex-col gap-4'}>
				<h2 className={'text-2xl font-semibold'}>Completed Games</h2>
				<div className={'flex flex-wrap gap-8'}>
					{completedRounds.map(({ round, originalIndex }) => (
						<ScheduleCard
							key={`completed-schedule-card-${originalIndex}`}
							games={round}
							title={generateRoundTitle(originalIndex)}
						/>
					))}
				</div>
			</div>
		</div>
	)
}
