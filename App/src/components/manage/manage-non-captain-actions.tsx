import { useCallback, useMemo } from 'react'
import { removeFromTeam } from '@/firebase/firestore'
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
import { useSeasonsContext } from '@/contexts/seasons-context'
import { useTeamsContext } from '@/contexts/teams-context'

export const ManageNonCaptainActions = () => {
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

	const removeFromTeamOnClickHandler = useCallback(async () => {
		removeFromTeam(
			authenticatedUserSnapshot?.ref,
			teamQueryDocumentSnapshot?.ref,
			currentSeasonQueryDocumentSnapshot?.ref
		)
			.then(() => {
				toast.success(
					`${
						authenticatedUserSnapshot?.data()?.firstname ?? 'Player'
					} has left the team`,
					{
						description: 'Send player invites to build up your roster.',
					}
				)
			})
			.catch((error) => {
				toast.error('Unable to Remove', {
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
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size={'sm'} variant={'ghost'}>
						<DotsVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className={'w-56'}>
					<DropdownMenuGroup>
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
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
