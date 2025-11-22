import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/shared/utils'
import { Users, AlertCircle } from 'lucide-react'

interface TeamCreationStatusCardProps {
	isRostered: boolean
}

/**
 * Displays status card when user is already rostered on a team
 */
export const TeamCreationStatusCard = ({
	isRostered,
}: TeamCreationStatusCardProps) => {
	if (isRostered) {
		return (
			<Card className={cn('max-w-2xl w-full')}>
				<CardHeader className='text-center'>
					<div className='flex justify-center mb-2'>
						<Users className='h-12 w-12 text-muted-foreground' />
					</div>
					<CardTitle className='text-xl'>Already on a Team</CardTitle>
					<CardDescription>
						You're currently rostered on a team for this season
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-4'>
					<Alert>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription>
							To create a new team, you'll need to leave your current team
							first. You can only be on one team per season.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		)
	}

	return null
}
