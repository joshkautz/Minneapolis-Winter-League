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
		<div className={'flex flex-wrap gap-8 text-center'}>
			<ComingSoon>
				<p>
					{`No schedule yet exists for the season. Check back after registration ends on ${formatTimestamp(selectedSeasonQueryDocumentSnapshot?.data()?.registrationEnd)}.`}
				</p>
			</ComingSoon>
		</div>
	)
}
