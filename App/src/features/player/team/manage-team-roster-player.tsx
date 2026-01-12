import { Link } from 'react-router-dom'
import { DocumentReference } from '@/firebase'
import { updateTeamRosterViaFunction } from '@/firebase/collections/functions'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DotsVerticalIcon, StarFilledIcon } from '@radix-ui/react-icons'
import { useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocument } from 'react-firebase-hooks/firestore'
import { DestructiveConfirmationDialog } from '@/shared/components'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useSeasonsContext, useTeamsContext } from '@/providers'
import { logger, errorHandler, PlayerDocument } from '@/shared/utils'
import type { PlayerSeason } from '@/types'
import { useUserStatus } from '@/shared/hooks/use-user-status'

export const ManageTeamRosterPlayer = ({
	playerRef,
}: {
	playerRef: DocumentReference<PlayerDocument>
}) => {
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const {
		userSnapshot: authenticatedUserSnapshot,
		isCaptain: isAuthenticatedUserCaptain,
		currentSeasonData,
	} = useUserStatus()
	const [playerSnapshot, , playerError] = useDocument(playerRef)

	// Log and notify on query errors
	useEffect(() => {
		if (playerError) {
			logger.error('Failed to load player:', {
				component: 'ManageTeamRosterPlayer',
				playerId: playerRef.id,
				error: playerError.message,
			})
			toast.error('Failed to load player', {
				description: playerError.message,
			})
		}
	}, [playerError, playerRef.id])

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) => team.id === currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	const isPlayerCaptain = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isPlayerPaid = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid,
		[playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isPlayerSigned = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item: PlayerSeason) =>
						item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.signed,
		[playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const demoteFromCaptainOnClickHandler = useCallback(async () => {
		if (!playerSnapshot?.id || !team?.id) {
			toast.error('Missing required data to demote captain')
			return
		}

		try {
			await updateTeamRosterViaFunction({
				teamId: team.id,
				playerId: playerSnapshot.id,
				action: 'demote',
			})

			logger.userAction('captain_demoted', 'ManageTeamRosterPlayer', {
				playerId: playerSnapshot?.id,
				teamId: team?.id,
				playerName: playerSnapshot?.data()?.firstname,
			})
			logger.firebase('demoteFromCaptain', 'teams', undefined, {
				playerId: playerSnapshot?.id,
				teamId: team?.id,
			})
			toast.success(
				`${
					playerSnapshot?.data()?.firstname ?? 'Player'
				} is no longer a team captain`,
				{
					description:
						'They are still on your roster. You may be promote them back at any time.',
				}
			)
		} catch (error) {
			logger.error(
				'Demote captain failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ManageTeamRosterPlayer',
					action: 'demote_captain',
					playerId: playerSnapshot?.id,
					teamId: team?.id,
				}
			)
			errorHandler.handleFirebase(error, 'demote_captain', 'teams', {
				fallbackMessage: 'Unable to demote captain. Please try again.',
			})
		}
	}, [team, playerSnapshot])

	const promoteToCaptainOnClickHandler = useCallback(async () => {
		if (!playerSnapshot?.id || !team?.id) {
			toast.error('Missing required data to promote captain')
			return
		}

		try {
			await updateTeamRosterViaFunction({
				teamId: team.id,
				playerId: playerSnapshot.id,
				action: 'promote',
			})

			logger.userAction('captain_promoted', 'ManageTeamRosterPlayer', {
				playerId: playerSnapshot?.id,
				teamId: team?.id,
				playerName: playerSnapshot?.data()?.firstname,
			})
			logger.firebase('promoteToCaptain', 'teams', undefined, {
				playerId: playerSnapshot?.id,
				teamId: team?.id,
			})
			toast.success('Congratulations', {
				description: `${
					playerSnapshot?.data()?.firstname ?? 'Player'
				} has been promoted to team captain.`,
			})
		} catch (error) {
			logger.error(
				'Promote captain failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ManageTeamRosterPlayer',
					action: 'promote_captain',
					playerId: playerSnapshot?.id,
					teamId: team?.id,
				}
			)
			errorHandler.handleFirebase(error, 'promote_captain', 'teams', {
				fallbackMessage:
					'Unable to promote captain. Ensure your email is verified and try again.',
			})
		}
	}, [team, playerSnapshot])

	const removeFromTeamOnClickHandler = useCallback(async () => {
		if (!playerSnapshot?.id || !team?.id) {
			toast.error('Missing required data to remove player')
			return
		}

		try {
			await updateTeamRosterViaFunction({
				teamId: team.id,
				playerId: playerSnapshot.id,
				action: 'remove',
			})

			toast.success(
				`${playerSnapshot?.data()?.firstname ?? 'Player'} has left the team`,
				{
					description: 'Send player invites to build up your roster.',
				}
			)
		} catch (error) {
			logger.error(
				'Remove player failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ManageTeamRosterPlayer',
					action: 'remove_player',
					playerId: playerSnapshot?.id,
					teamId: team?.id,
				}
			)
			errorHandler.handleFirebase(error, 'remove_player', 'teams', {
				fallbackMessage: 'Unable to remove player. Please try again.',
			})
		}
	}, [team, playerSnapshot])

	return (
		<div className='border-b border-border/50 last:border-b-0 relative'>
			{playerSnapshot ? (
				<div className='flex items-center justify-between py-3 pl-1 pr-3 gap-3'>
					<div className='flex items-center gap-2 flex-1 min-w-0'>
						<div className='flex items-center gap-2 min-w-0'>
							<Link
								to={`/players/${playerRef.id}`}
								className='font-medium truncate hover:underline focus-visible:underline focus-visible:outline-none'
							>
								{playerSnapshot.data()?.firstname}{' '}
								{playerSnapshot.data()?.lastname}
							</Link>
							{isPlayerCaptain && (
								<StarFilledIcon
									className='text-primary flex-shrink-0'
									aria-label='Team Captain'
								/>
							)}
						</div>
					</div>
					<div className='flex items-center gap-3 flex-shrink-0'>
						<Badge
							className={'select-none hover:bg-initial text-xs'}
							variant={isPlayerPaid && isPlayerSigned ? 'secondary' : 'outline'}
						>
							{isPlayerPaid && isPlayerSigned ? 'registered' : 'unregistered'}
						</Badge>
						{isAuthenticatedUserCaptain && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size={'sm'}
										variant={'ghost'}
										className='h-8 w-8'
										aria-label={`Manage ${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`}
									>
										<DotsVerticalIcon className='h-4 w-4' />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className={'w-56'} align='end'>
									<DropdownMenuGroup>
										<DropdownMenuItem
											disabled={!isPlayerCaptain}
											onClick={demoteFromCaptainOnClickHandler}
										>
											Demote from captain
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={isPlayerCaptain}
											onClick={promoteToCaptainOnClickHandler}
										>
											Promote to captain
										</DropdownMenuItem>
										<DestructiveConfirmationDialog
											title={
												playerSnapshot.id === authenticatedUserSnapshot?.id
													? 'Are you sure you want to leave?'
													: 'Are you sure?'
											}
											description={
												playerSnapshot.id === authenticatedUserSnapshot?.id
													? 'You will not be able to rejoin until a captain accepts you back on to the roster.'
													: `${
															playerSnapshot.data()?.firstname
														} will not be able to rejoin until a captain accepts them back on to the roster.`
											}
											onConfirm={removeFromTeamOnClickHandler}
										>
											<DropdownMenuItem
												className='focus:bg-destructive focus:text-destructive-foreground'
												onClick={(event) => event.preventDefault()}
											>
												{playerSnapshot.id === authenticatedUserSnapshot?.id
													? 'Leave team'
													: 'Remove from team'}
											</DropdownMenuItem>
										</DestructiveConfirmationDialog>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>
			) : (
				<div className='flex items-center py-3 px-1'>
					<Skeleton className='h-5 w-48' />
				</div>
			)}
		</div>
	)
}
