import { useState, useMemo } from 'react'
import { Users, UserPlus, AlertCircle } from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { JoinTeam } from '@/features/public/join'
import { CreateTeam } from '@/features/public/create/create-team'
import { useTeamsContext } from '@/providers'

interface TeamOptionsViewProps {
	isLoading: boolean
}

/**
 * Component for team options - joining or creating a team
 * Displayed when user is not rostered on any team
 */
export const TeamOptionsView = ({ isLoading }: TeamOptionsViewProps) => {
	const [activeTab, setActiveTab] = useState('join')
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()

	const isTeamRegistrationFull = useMemo(() => {
		if (!currentSeasonTeamsQuerySnapshot) return false

		// Count teams that are fully registered
		const registeredTeamsCount = currentSeasonTeamsQuerySnapshot.docs.filter(
			(teamDoc) => teamDoc.data().registered === true
		).length

		return registeredTeamsCount >= 12
	}, [currentSeasonTeamsQuerySnapshot])

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title={isLoading ? 'Loading...' : 'Team Options'}
				description={
					isLoading
						? 'Loading team options...'
						: 'Join an existing team or create a new one for the current season'
				}
				icon={Users}
			/>

			<Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
				<div className='flex justify-center'>
					<TabsList className='grid w-fit grid-cols-2'>
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

				<TabsContent value='join' className='mt-6'>
					<JoinTeam />
				</TabsContent>

				<TabsContent value='create' className='mt-6'>
					{isTeamRegistrationFull && (
						<div className='flex justify-center mb-6'>
							<div className='w-full max-w-2xl'>
								<Alert>
									<AlertCircle className='h-4 w-4' />
									<AlertTitle>Team Registration Full</AlertTitle>
									<AlertDescription>
										The league has reached the maximum of 12 fully registered
										teams for this season. Team creation is currently disabled.
									</AlertDescription>
								</Alert>
							</div>
						</div>
					)}
					<CreateTeam />
				</TabsContent>
			</Tabs>
		</PageContainer>
	)
}
