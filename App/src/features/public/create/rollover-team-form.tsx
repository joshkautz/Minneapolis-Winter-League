import { LoadingButton } from '@/shared/components'
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
import type { TeamCreationResult } from './hooks/use-team-creation'
import { useRolloverTeamForm } from './hooks'

interface RolloverTeamFormProps {
	handleResult: (result: TeamCreationResult) => void
	seasonId: string
	isTeamRegistrationFull?: boolean
}

export const RolloverTeamForm = ({
	handleResult,
	seasonId,
	isTeamRegistrationFull = false,
}: RolloverTeamFormProps) => {
	const { form, onSubmit, availableTeams, hasCaptainTeams, isSubmitting } =
		useRolloverTeamForm({
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
											onValueChange={field.onChange}
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
							<LoadingButton
								type='submit'
								disabled={isTeamRegistrationFull}
								className='w-full h-11'
								size='lg'
								loading={isSubmitting}
								loadingText='Rolling Over Team...'
							>
								Rollover Existing Team
							</LoadingButton>
						</div>
					</form>
				</Form>
			)}
		</div>
	)
}
