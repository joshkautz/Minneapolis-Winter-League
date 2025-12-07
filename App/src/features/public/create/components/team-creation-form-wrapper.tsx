import { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TeamCreationFormWrapperProps {
	rolloverMode: boolean
	onToggleMode: () => void
	createNewForm: ReactNode
	rolloverForm: ReactNode
}

/**
 * Wrapper component for team creation forms with tabs functionality
 */
export const TeamCreationFormWrapper = ({
	rolloverMode,
	onToggleMode,
	createNewForm,
	rolloverForm,
}: TeamCreationFormWrapperProps) => {
	return (
		<div className='w-full'>
			<Tabs
				value={rolloverMode ? 'rollover' : 'create'}
				onValueChange={(value) => {
					const shouldBeRollover = value === 'rollover'
					if (shouldBeRollover !== rolloverMode) {
						onToggleMode()
					}
				}}
				className='w-full'
			>
				<TabsList className='grid w-full grid-cols-2 mb-6'>
					<TabsTrigger value='create'>Create New Team</TabsTrigger>
					<TabsTrigger value='rollover'>Rollover Existing Team</TabsTrigger>
				</TabsList>

				<TabsContent value='create' className='mt-0'>
					<div className='space-y-6'>
						<div className='space-y-2'>
							<h3 className='text-lg font-semibold'>Create New Team</h3>
							<p className='text-sm text-muted-foreground'>
								Create a brand new team to compete in the upcoming season.
							</p>
						</div>
						{createNewForm}
					</div>
				</TabsContent>

				<TabsContent value='rollover' className='mt-0'>
					<div className='space-y-6'>
						<div className='space-y-2'>
							<h3 className='text-lg font-semibold'>Rollover Existing Team</h3>
							<p className='text-sm text-muted-foreground'>
								Select a team from a previous season that you captained to
								rollover for the new season.
							</p>
						</div>
						{rolloverForm}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
