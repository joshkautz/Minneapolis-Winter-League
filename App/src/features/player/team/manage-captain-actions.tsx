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
import { useManageCaptainActions } from './hooks/use-manage-captain-actions'

export const ManageCaptainActions = () => {
	const {
		open,
		setOpen,
		editTeamDialogOpen,
		setEditTeamDialogOpen,
		leaveTeamDialogOpen,
		setLeaveTeamDialogOpen,
		deleteTeamDialogOpen,
		setDeleteTeamDialogOpen,
		removeFromTeamOnClickHandler,
		deleteTeamOnClickHandler,
		handleEditTeamClick,
		handleLeaveTeamClick,
		handleDeleteTeamClick,
	} = useManageCaptainActions()

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
						<DropdownMenuItem
							className='focus:bg-destructive focus:text-destructive-foreground'
							onClick={handleLeaveTeamClick}
						>
							Leave team
						</DropdownMenuItem>
						<DropdownMenuItem
							className='focus:bg-destructive focus:text-destructive-foreground'
							onClick={handleDeleteTeamClick}
						>
							Delete team
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Edit Team Dialog */}
			<ManageEditTeamDialog
				open={editTeamDialogOpen}
				onOpenChange={setEditTeamDialogOpen}
			/>

			{/* Leave Team Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={leaveTeamDialogOpen}
				onOpenChange={setLeaveTeamDialogOpen}
				title={'Are you sure you want to leave?'}
				description={
					'You will not be able to rejoin unless a captain accepts you back on to the roster.'
				}
				onConfirm={removeFromTeamOnClickHandler}
			>
				<></>
			</DestructiveConfirmationDialog>

			{/* Delete Team Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deleteTeamDialogOpen}
				onOpenChange={setDeleteTeamDialogOpen}
				title={'Are you sure?'}
				description={
					'The entire team will be deleted. This action is irreversible.'
				}
				onConfirm={deleteTeamOnClickHandler}
			>
				<></>
			</DestructiveConfirmationDialog>
		</div>
	)
}
