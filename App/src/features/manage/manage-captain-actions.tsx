import { useCallback, useMemo, useState } from 'react'
import {
	deleteTeamViaFunction,
	manageTeamPlayerViaFunction,
} from '@/firebase/collections/functions'
import { toast } from 'sonner'
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
import { useTeamsContext } from '@/providers'
import { useUserStatus } from '@/shared/hooks/use-user-status'

export const ManageCaptainActions = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { userSnapshot: authenticatedUserSnapshot, currentSeasonData } =
		useUserStatus()

	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	const [open, setOpen] = useState(false)
	const [editTeamDialogOpen, setEditTeamDialogOpen] = useState(false)

	const removeFromTeamOnClickHandler = useCallback(async () => {
		if (!authenticatedUserSnapshot?.id || !teamQueryDocumentSnapshot?.id) {
			toast.error('Missing required data to leave team')
			return
		}

		try {
			await manageTeamPlayerViaFunction({
				teamId: teamQueryDocumentSnapshot.id,
				playerId: authenticatedUserSnapshot.id,
				action: 'remove',
			})

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
		} catch (error) {
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
		}
	}, [authenticatedUserSnapshot, teamQueryDocumentSnapshot])

	const deleteTeamOnClickHandler = useCallback(async () => {
		if (!teamQueryDocumentSnapshot?.id) {
			toast.error('Missing team data to delete team')
			return
		}

		try {
			await deleteTeamViaFunction(teamQueryDocumentSnapshot.id)

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
		} catch (error) {
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
		}
	}, [authenticatedUserSnapshot, teamQueryDocumentSnapshot])

	const handleEditTeamClick = useCallback(() => {
		// Close dropdown first
		setOpen(false)
		// Open dialog immediately - let Radix handle focus management
		setEditTeamDialogOpen(true)
	}, [])

	return (
		<div className='absolute right-6'>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button size={'sm'} variant={'ghost'}>
						<DotsVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className={'w-56'}>
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={handleEditTeamClick}>
							Edit team
						</DropdownMenuItem>
						<DestructiveConfirmationDialog
							title={'Are you sure you want to leave?'}
							description={
								'You will not be able to rejoin unless a captain accepts you back on to the roster.'
							}
							onConfirm={removeFromTeamOnClickHandler}
						>
							<DropdownMenuItem
								className='focus:bg-destructive focus:text-destructive-foreground'
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
								className='focus:bg-destructive focus:text-destructive-foreground'
								onClick={(event) => event.preventDefault()}
							>
								Delete team
							</DropdownMenuItem>
						</DestructiveConfirmationDialog>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<ManageEditTeamDialog
				open={editTeamDialogOpen}
				onOpenChange={setEditTeamDialogOpen}
			/>
		</div>
	)
}
