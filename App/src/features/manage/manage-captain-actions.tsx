import { useCallback, useMemo, useState } from 'react'
import { deleteTeam, removeFromTeam } from '@/firebase/firestore'
import { toast } from 'sonner'
import { useAuthContext } from '@/providers'
import { Button } from '@/components/ui/button'
import { DotsVerticalIcon } from '@radix-ui/react-icons'
import { DestructiveConfirmationDialog } from '@/shared/components'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ManageEditTeamDialog } from './manage-edit-team-dialog'
import { errorHandler, logger } from '@/shared/utils'
import { useSeasonsContext } from '@/providers'
import { useTeamsContext } from '@/providers'

export const ManageCaptainActions = () => {
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { authenticatedUserSnapshot } = useAuthContext()

	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					authenticatedUserSnapshot
						?.data()
						?.seasons.find(
							(item) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[
			authenticatedUserSnapshot,
			currentSeasonTeamsQuerySnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const [open, setOpen] = useState(false)

	const removeFromTeamOnClickHandler = useCallback(async () => {
		removeFromTeam(
			authenticatedUserSnapshot?.ref,
			teamQueryDocumentSnapshot?.ref,
			currentSeasonQueryDocumentSnapshot?.ref
		)
			.then(() => {
				logger.userAction('team_left', 'ManageCaptainActions', {
					teamId: teamQueryDocumentSnapshot?.id,
					userId: authenticatedUserSnapshot?.id,
				})
				logger.firebase('removeFromTeam', 'teams', undefined, {
					teamId: teamQueryDocumentSnapshot?.id,
				})
				toast.success('Success', {
					description: 'You have left the team.',
				})
			})
			.catch((error) => {
				logger.error(
					'Leave team failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageCaptainActions',
						action: 'leave_team',
						teamId: teamQueryDocumentSnapshot?.id,
					}
				)
				errorHandler.handleFirebase(error, 'leave_team', 'teams', {
					fallbackMessage: 'Failed to leave team. Please try again.',
				})
			})
	}, [
		authenticatedUserSnapshot,
		teamQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshot,
	])

	const deleteTeamOnClickHandler = useCallback(async () => {
		deleteTeam(
			teamQueryDocumentSnapshot?.ref,
			currentSeasonQueryDocumentSnapshot?.ref
		)
			.then(() => {
				logger.userAction('team_deleted', 'ManageCaptainActions', {
					teamId: teamQueryDocumentSnapshot?.id,
					userId: authenticatedUserSnapshot?.id,
				})
				logger.firebase('deleteTeam', 'teams', undefined, {
					teamId: teamQueryDocumentSnapshot?.id,
				})
				toast.success('Success', {
					description: 'Team has been deleted.',
				})
			})
			.catch((error) => {
				logger.error(
					'Delete team failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageCaptainActions',
						action: 'delete_team',
						teamId: teamQueryDocumentSnapshot?.id,
					}
				)
				errorHandler.handleFirebase(error, 'delete_team', 'teams', {
					fallbackMessage: 'Failed to delete team. Please try again.',
				})
			})
	}, [
		authenticatedUserSnapshot,
		teamQueryDocumentSnapshot,
		currentSeasonQueryDocumentSnapshot,
	])

	return (
		<div className="absolute right-6 top-6">
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button size={'sm'} variant={'ghost'}>
						<DotsVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className={'w-56'}>
					<DropdownMenuGroup>
						<ManageEditTeamDialog closeDialog={() => setOpen(false)}>
							<DropdownMenuItem onClick={(event) => event.preventDefault()}>
								Edit team
							</DropdownMenuItem>
						</ManageEditTeamDialog>
						<DestructiveConfirmationDialog
							title={'Are you sure you want to leave?'}
							description={
								'You will not be able to rejoin unless a captain accepts you back on to the roster.'
							}
							onConfirm={removeFromTeamOnClickHandler}
						>
							<DropdownMenuItem
								className="focus:bg-destructive focus:text-destructive-foreground"
								onClick={(event) => event.preventDefault()}
							>
								Leave team
							</DropdownMenuItem>
						</DestructiveConfirmationDialog>

						<DestructiveConfirmationDialog
							title={'Are you sure?'}
							description={
								'The entire team will be deleted. This action is irreversible.'
							}
							onConfirm={deleteTeamOnClickHandler}
						>
							<DropdownMenuItem
								className="focus:bg-destructive focus:text-destructive-foreground"
								onClick={(event) => event.preventDefault()}
							>
								Delete team
							</DropdownMenuItem>
						</DestructiveConfirmationDialog>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
