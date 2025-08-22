import { ComingSoon } from '@/shared/components'
import { useSeasonsContext } from '@/providers'
import { formatTimestamp } from '@/shared/utils'

/**
 * ScheduleEmptyState Component
 * 
 * Displays empty state when no games are scheduled yet.
 * Extracted from main Schedule component for better organization.
 */
export const ScheduleEmptyState = () => {
	const { selectedSeasonQueryDocumentSnapshot } = useSeasonsContext()

	return (
		<div className={'flex flex-wrap gap-8'}>
			<ComingSoon>
				<p className={'pt-6'}>
					{`There is no schedule to display. Please wait for registration to end on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.registrationEnd)}.`}
				</p>
			</ComingSoon>
		</div>
	)
}
