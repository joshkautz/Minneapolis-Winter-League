import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/shared/utils'
import { Users, AlertCircle, Ban } from 'lucide-react'

interface TeamCreationStatusCardProps {
	isRostered?: boolean
	isBanned?: boolean
}

/**
 * Displays status card when user is already rostered on a team or is banned
 */
export const TeamCreationStatusCard = ({
	isRostered,
	isBanned,
}: TeamCreationStatusCardProps) => {
	if (isBanned) {
		return (
			<Card className={cn('w-full')}>
				<CardHeader className='text-center'>
					<div className='flex justify-center mb-2'>
						<Ban className='h-12 w-12 text-destructive' />
					</div>
					<CardTitle className='text-xl'>Account Banned</CardTitle>
					<CardDescription>
						Your account has been banned from Minneapolis Winter League
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-4'>
					<Alert variant='destructive'>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription>
							You are not able to create or rollover teams while your account is
							banned. If you believe this is an error, please contact the league
							administrators.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		)
	}

	if (isRostered) {
		return (
			<Card className={cn('w-full')}>
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
