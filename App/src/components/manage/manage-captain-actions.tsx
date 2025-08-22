import { useCallback, useMemo, useState } from 'react'
import { deleteTeam, removeFromTeam } from '@/firebase/firestore'
import { toast } from 'sonner'
import { useAuthContext } from '@/contexts/auth-context'
import { Button } from '../ui/button'
import { DotsVerticalIcon } from '@radix-ui/react-icons'
import { DestructiveConfirmationDialog } from '../destructive-confirmation-dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { ManageEditTeamDialog } from './manage-edit-team-dialog'
import { useSeasonsContext } from '@/contexts/seasons-context'
import { useTeamsContext } from '@/contexts/teams-context'

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
				toast.success('Success', {
					description: 'You have left the team.',
				})
			})
			.catch((error) => {
				toast.error('Failure', {
					description: error.message,
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
				toast.success('Success', {
					description: 'Team has been deleted.',
				})
			})
			.catch((error) => {
				toast.error('Failure', {
					description: error.message,
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
