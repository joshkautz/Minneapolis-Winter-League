import { Timestamp } from '@firebase/firestore'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { cn, formatTimestamp } from '@/shared/utils'

interface TeamCreationStatusCardProps {
	isRostered: boolean
	isRegistrationOpen: boolean
	registrationStartDate?: Timestamp
}

/**
 * Displays status cards for different team creation states
 */
export const TeamCreationStatusCard = ({
	isRostered,
	isRegistrationOpen,
	registrationStartDate,
}: TeamCreationStatusCardProps) => {
	if (isRostered) {
		return (
			<Card className={cn('max-w-[800px] w-full mx-auto my-8')}>
				<CardHeader>{`You're already on a team!`}</CardHeader>
				<CardContent>{`Leave your current team in order to create a new one.`}</CardContent>
			</Card>
		)
	}

	if (!isRegistrationOpen) {
		return (
			<Card className={cn('max-w-[800px] w-full mx-auto my-8')}>
				<CardHeader>{`Registration not open.`}</CardHeader>
				<CardContent>
					{`The next registration period begins on ${formatTimestamp(registrationStartDate)}`}
				</CardContent>
			</Card>
		)
	}

	return null
}
