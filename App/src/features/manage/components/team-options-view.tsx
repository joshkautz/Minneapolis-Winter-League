import { useState } from 'react'
import { Users, UserPlus } from 'lucide-react'
import { PageContainer, PageHeader } from '@/shared/components'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { JoinTeam } from '@/features/join'
import { CreateTeam } from '@/features/create/create-team'

interface TeamOptionsViewProps {
	isLoading: boolean
}

/**
 * Component for team options - joining or creating a team
 * Displayed when user is not rostered on any team
 */
export const TeamOptionsView = ({ isLoading }: TeamOptionsViewProps) => {
	const [activeTab, setActiveTab] = useState('join')

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
					<CreateTeam />
				</TabsContent>
			</Tabs>
		</PageContainer>
	)
}
