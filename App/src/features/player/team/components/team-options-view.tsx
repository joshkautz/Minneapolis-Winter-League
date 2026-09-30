import { useState } from 'react'
import { Users, UserPlus, AlertCircle } from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { JoinTeam } from '@/features/public/join'
import { CreateTeam } from '@/features/public/create'
import { useIsTeamRegistrationFull } from '@/shared/hooks'
import { WaiverPrompt } from '@/features/player/waiver'
import { REGISTRATION_SPOTS } from '@/shared/utils'

interface TeamOptionsViewProps {
	isLoading: boolean
}

/**
 * Component for team options - joining or creating a team
 * Displayed when user is not rostered on any team
 */
export const TeamOptionsView = ({ isLoading }: TeamOptionsViewProps) => {
	const [activeTab, setActiveTab] = useState('join')
	const isTeamRegistrationFull = useIsTeamRegistrationFull()

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title={isLoading ? 'Loading...' : 'Find a Team'}
				description={
					isLoading
						? 'Loading team options...'
						: 'Join an existing team or create a new one for the current season'
				}
				icon={Users}
			/>

			<WaiverPrompt />

			{/* Above both tabs: Join is the one a player lands on. */}
			{isTeamRegistrationFull && (
				<Alert>
					<AlertCircle className='h-4 w-4' />
					<AlertTitle>This season is full</AlertTitle>
					<AlertDescription>
						All {REGISTRATION_SPOTS} team spots are taken. Teams that did not
						register in time have been removed, and anything paid toward them is
						being refunded. New teams cannot be created.
					</AlertDescription>
				</Alert>
			)}
			<Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
				<div className='flex justify-center'>
					<TabsList className='grid w-full max-w-md grid-cols-2'>
						<TabsTrigger value='join' className='flex items-center gap-2'>
							<Users className='h-4 w-4' />
							Join Team
						</TabsTrigger>
						<TabsTrigger value='create' className='flex items-center gap-2'>
							<UserPlus className='h-4 w-4' />
							Create Team
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value='join' className='mt-6 w-full'>
					<JoinTeam />
				</TabsContent>

				<TabsContent value='create' className='mt-6 w-full'>
					<CreateTeam />
				</TabsContent>
			</Tabs>
		</PageContainer>
	)
}
