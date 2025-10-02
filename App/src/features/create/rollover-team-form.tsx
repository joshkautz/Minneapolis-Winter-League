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
import type { TeamCreationData } from '@/features/create/hooks/use-team-creation'
import { useRolloverTeamForm } from '@/features/create/hooks'

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
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot,
		currentSeasonTeamsQuerySnapshot,
		seasonsQuerySnapshot,
		isSubmitting,
	} = useRolloverTeamForm({
		setNewTeamDocument,
		handleResult,
		seasonId,
	})

	return (
		<div className='w-full'>
			{!teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot ? (
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
												{teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot?.docs
													.sort((a, b) => {
														const docs = seasonsQuerySnapshot?.docs
														if (docs) {
															const seasonA = docs.find(
																(season) => season.id === a.data().season.id
															)
															const seasonB = docs.find(
																(season) => season.id === b.data().season.id
															)
															if (seasonA && seasonB) {
																return (
																	seasonB.data()?.dateStart.seconds -
																	seasonA.data()?.dateStart.seconds
																)
															}
															return 0
														}
														return 0
													})
													.map((team) => {
														const teamHasBeenRolledOver =
															currentSeasonTeamsQuerySnapshot?.docs.some(
																(teamQueryDocumentSnapshot) =>
																	teamQueryDocumentSnapshot.data().teamId ===
																	team.data().teamId
															)
														const seasonQueryDocumentSnapshot =
															seasonsQuerySnapshot?.docs.find(
																(season) => season.id === team.data().season.id
															)

														return (
															<SelectItem
																key={team.id}
																value={team.data().name}
																disabled={teamHasBeenRolledOver}
																className='justify-center'
															>
																<div className='flex flex-col items-center text-center w-full'>
																	<span className='font-medium'>
																		{team.data().name}
																	</span>
																	<span className='text-xs text-muted-foreground'>
																		{seasonQueryDocumentSnapshot?.data().name}
																		{teamHasBeenRolledOver &&
																			' (Already Rolled Over)'}
																	</span>
																</div>
															</SelectItem>
														)
													})}
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
