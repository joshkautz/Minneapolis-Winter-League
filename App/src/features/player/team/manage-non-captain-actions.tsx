import { useCallback, useMemo, useState } from 'react'
import { manageTeamPlayerViaFunction } from '@/firebase/collections/functions'
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
import { useTeamsContext } from '@/providers'
import { logger, errorHandler } from '@/shared/utils'
import { useUserStatus } from '@/shared/hooks/use-user-status'

export const ManageNonCaptainActions = () => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { userSnapshot: authenticatedUserSnapshot, currentSeasonData } =
		useUserStatus()
	const [dropdownOpen, setDropdownOpen] = useState(false)
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

	const teamQueryDocumentSnapshot = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
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
					description: 'You can now join a different team or create your own.',
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
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<Button size='sm' variant='ghost' aria-label='Team options'>
						<DotsVerticalIcon aria-hidden='true' />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className={'w-56'}>
					<DropdownMenuGroup>
						<DropdownMenuItem
							className='focus:bg-destructive focus:text-destructive-foreground'
							onSelect={() => {
								setDropdownOpen(false)
								setConfirmDialogOpen(true)
							}}
						>
							Leave team
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DestructiveConfirmationDialog
				title={'Are you sure you want to leave?'}
				description={
					'You will not be able to rejoin unless a captain accepts you back on to the roster.'
				}
				onConfirm={removeFromTeamOnClickHandler}
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
			>
				{/* This won't be used as a trigger since we control it with open/onOpenChange */}
				<div />
			</DestructiveConfirmationDialog>
		</div>
	)
}
