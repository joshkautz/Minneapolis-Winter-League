import { useCallback, useMemo } from 'react'
import { manageTeamPlayerViaFunction } from '@/firebase/collections/functions'
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
import { useSeasonsContext } from '@/providers'
import { useTeamsContext } from '@/providers'
import { logger, errorHandler } from '@/shared/utils'

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

			toast.success(
				`${
					authenticatedUserSnapshot?.data()?.firstname ?? 'Player'
				} has left the team`,
				{
					description: 'Send player invites to build up your roster.',
				}
			)
		} catch (error) {
			logger.error(
				'Leave team failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ManageNonCaptainActions',
					action: 'leave_team',
					teamId: teamQueryDocumentSnapshot?.id,
					userId: authenticatedUserSnapshot?.id,
				}
			)
			errorHandler.handleFirebase(error, 'leave_team', 'teams', {
				fallbackMessage: 'Unable to leave team. Please try again.',
			})
		}
	}, [authenticatedUserSnapshot, teamQueryDocumentSnapshot])

	return (
		<div className='absolute right-6'>
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
								className='focus:bg-destructive focus:text-destructive-foreground'
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
