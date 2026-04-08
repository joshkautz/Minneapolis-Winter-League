import { Button } from '@/components/ui/button'
import {
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from '@/components/ui/form'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { TeamCreationData } from '@/features/public/create/hooks/use-team-creation'
import { useRolloverTeamForm } from '@/features/public/create/hooks'

interface RolloverTeamFormProps {
	setNewTeamDocument: React.Dispatch<
		React.SetStateAction<TeamCreationData | undefined>
	>
	handleResult: ({
		success,
		title,
		description,
		navigation,
	}: {
		success: boolean
		title: string
		description: string
		navigation: boolean
	}) => void
	seasonId: string
	isTeamRegistrationFull?: boolean
}

export const RolloverTeamForm = ({
	setNewTeamDocument,
	handleResult,
	seasonId,
	isTeamRegistrationFull = false,
}: RolloverTeamFormProps) => {
	const {
		form,
		onSubmit,
		handleTeamChange,
		availableTeams,
		hasCaptainTeams,
		isSubmitting,
	} = useRolloverTeamForm({
		setNewTeamDocument,
		handleResult,
		seasonId,
	})

	return (
		<div className='w-full'>
			{!hasCaptainTeams ? (
				<div className='text-center py-8'>
					<p className='text-muted-foreground'>
						No previous teams available for rollover
					</p>
					<p className='text-sm text-muted-foreground mt-2'>
						You haven't captained any teams in previous seasons
					</p>
				</div>
			) : (
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className='space-y-6'
						noValidate
					>
						<FormField
							control={form.control}
							name='selectedTeam'
							render={({ field }) => (
								<FormItem>
									<FormLabel className='text-sm font-medium'>
										Teams You've Captained
									</FormLabel>
									<FormControl>
										<Select
											value={field.value}
											onValueChange={(value) => {
												field.onChange(value)
												handleTeamChange(value)
											}}
											disabled={isTeamRegistrationFull}
										>
											<SelectTrigger
												className='w-full h-11 justify-between min-h-11'
												aria-label='Select a team to rollover'
											>
												<div className='flex-1 text-center'>
													<SelectValue placeholder='Select a previous team to rollover' />
												</div>
											</SelectTrigger>
											<SelectContent>
												{availableTeams.map((team) => (
													<SelectItem
														key={team.canonicalTeamId}
														value={team.canonicalTeamId}
														disabled={team.alreadyRolledOver}
														className='justify-center'
													>
														<div className='flex flex-col items-center text-center w-full'>
															<span className='font-medium'>
																{team.displayName}
															</span>
															<span className='text-xs text-muted-foreground'>
																{team.mostRecentSeasonName}
																{team.alreadyRolledOver &&
																	' (Already Rolled Over)'}
															</span>
														</div>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='pt-2'>
							<Button
								type='submit'
								disabled={isSubmitting || isTeamRegistrationFull}
								className='w-full h-11'
								size='lg'
							>
								{isSubmitting
									? 'Rolling Over Team...'
									: 'Rollover Existing Team'}
							</Button>
						</div>
					</form>
				</Form>
			)}
		</div>
	)
}
