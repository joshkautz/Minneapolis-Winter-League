import {
	DocumentReference,
	promoteToCaptain,
	demoteFromCaptain,
	removeFromTeam,
} from '@/firebase/firestore'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DotsVerticalIcon, StarFilledIcon } from '@radix-ui/react-icons'
import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthContext } from '@/providers'
import { PlayerDocument } from '@/shared/utils'
import { useDocument } from 'react-firebase-hooks/firestore'
import { DestructiveConfirmationDialog } from '@/shared/components'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useSeasonsContext } from '@/providers'
import { useTeamsContext } from '@/providers'
import { logger, errorHandler } from '@/shared/utils'
import type { PlayerSeason, TeamRosterPlayer } from '@/types'

export const ManageTeamRosterPlayer = ({
	playerRef,
}: {
	playerRef: DocumentReference<PlayerDocument>
}) => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const [playerSnapshot] = useDocument(playerRef as any)

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(team) =>
					team.id ===
					authenticatedUserSnapshot
						?.data()
						?.seasons.find(
							(item: PlayerSeason) =>
								item.season.id === currentSeasonQueryDocumentSnapshot?.id
						)?.team?.id
			),
		[
			authenticatedUserSnapshot,
			currentSeasonTeamsQuerySnapshot,
			currentSeasonQueryDocumentSnapshot,
		]
	)

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			team
				?.data()
				.roster.find(
					(item: TeamRosterPlayer) =>
						item.player.id === authenticatedUserSnapshot?.id
				)?.captain,
		[team, authenticatedUserSnapshot]
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

	const demoteFromCaptainOnClickHandler = useCallback(
		() =>
			demoteFromCaptain(
				playerRef,
				team?.ref,
				currentSeasonQueryDocumentSnapshot?.ref
			)
				.then(() => {
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
				})
				.catch((error) => {
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
				}),
		[team, playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const promoteToCaptainOnClickHandler = useCallback(
		() =>
			promoteToCaptain(
				playerRef,
				team?.ref,
				currentSeasonQueryDocumentSnapshot?.ref
			)
				.then(() => {
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
				})
				.catch((error) => {
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
				}),
		[team, playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const removeFromTeamOnClickHandler = useCallback(async () => {
		removeFromTeam(
			playerRef,
			team?.ref,
			currentSeasonQueryDocumentSnapshot?.ref
		)
			.then(() => {
				toast.success(
					`${playerSnapshot?.data()?.firstname ?? 'Player'} has left the team`,
					{
						description: 'Send player invites to build up your roster.',
					}
				)
			})
			.catch((error) => {
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
			})
	}, [team, playerSnapshot, currentSeasonQueryDocumentSnapshot])

	return (
		<div>
			{playerSnapshot ? (
				<div className='flex items-end gap-2 py-2'>
					<div className='flex flex-row items-center'>
						<p className='mr-2 select-none'>
							{playerSnapshot.data()?.firstname}{' '}
							{playerSnapshot.data()?.lastname}{' '}
						</p>
						{isPlayerCaptain && <StarFilledIcon className='text-primary' />}
					</div>
					<div className='flex justify-end flex-1 gap-2'>
						<div className='flex items-center'>
							<Badge
								className={'select-none hover:bg-initial'}
								variant={
									isPlayerPaid && isPlayerSigned ? 'secondary' : 'outline'
								}
							>
								{isPlayerPaid && isPlayerSigned ? 'registered' : 'unregistered'}
							</Badge>
						</div>
						{isAuthenticatedUserCaptain && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size={'sm'} variant={'ghost'}>
										<DotsVerticalIcon />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className={'w-56'}>
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
												playerSnapshot.id == authenticatedUserSnapshot?.id
													? 'Are you sure you want to leave?'
													: 'Are you sure?'
											}
											description={
												playerSnapshot.id == authenticatedUserSnapshot?.id
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
				<div className='flex items-end gap-2 py-2'>
					<div className='mr-2'>
						<Skeleton className='h-4 w-[250px]' />
					</div>
				</div>
			)}
		</div>
	)
}
