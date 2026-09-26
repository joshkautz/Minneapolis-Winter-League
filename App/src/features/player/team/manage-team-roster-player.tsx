import { Link } from 'react-router-dom'
import { type DocumentReference } from 'firebase/firestore'
import { updateTeamRosterViaFunction } from '@/firebase/collections/functions'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DotsVerticalIcon, StarFilledIcon } from '@radix-ui/react-icons'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocument } from 'react-firebase-hooks/firestore'
import {
	DestructiveConfirmationDialog,
	LoadingSpinner,
} from '@/shared/components'
import { usePendingAction } from '@/shared/hooks/use-pending-action'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useSeasonsContext, useTeamsContext } from '@/providers'
import {
	logger,
	isPlayerRegisteredForSeason,
	errorMessage,
} from '@/shared/utils'
import { PlayerDocument } from '@/types'
import { playerSeasonRef } from '@/firebase/collections/players'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import { useUserStatus } from '@/shared/hooks/use-user-status'
import { useDeparturePaymentNote } from './hooks/use-departure-payment-note'
import { useQueryErrorHandler } from '@/shared/hooks'

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
	const isSelf = playerRef.id === authenticatedUserSnapshot?.id
	const departurePaymentNote = useDeparturePaymentNote(
		isSelf ? null : (playerSnapshot?.data()?.firstname ?? 'This player')
	)
	const [playerSeasonSnapshot] = useDocument(
		playerSeasonRef(playerRef.id, currentSeasonQueryDocumentSnapshot?.id)
	)

	useQueryErrorHandler({
		error: playerError,
		component: 'ManageTeamRosterPlayer',
		errorLabel: 'player',
		context: { playerId: playerRef.id },
	})

	const team = useMemo(
		() =>
			currentSeasonTeamsQuerySnapshot?.docs.find(
				(teamDoc) =>
					canonicalTeamIdFromTeamSeasonDoc(teamDoc) ===
					currentSeasonData?.team?.id
			),
		[currentSeasonTeamsQuerySnapshot, currentSeasonData]
	)

	// `team.id` is the seasonId on a teamSeasons subdoc — derive the canonical
	// team id for backend calls.
	const canonicalTeamId = team
		? canonicalTeamIdFromTeamSeasonDoc(team)
		: undefined

	const isPlayerCaptain = useMemo(
		() => playerSeasonSnapshot?.data()?.captain === true,
		[playerSeasonSnapshot]
	)

	// Promote and demote run from a menu that closes on click, so the menu's
	// trigger is where this row shows the change is on its way. Waits for
	// the captain flag to flip, so the star and the spinner change together.
	const [captainChangeTarget, setCaptainChangeTarget] = useState<
		boolean | null
	>(null)
	const { pending: isChangingCaptain, run: runCaptainChange } =
		usePendingAction(
			captainChangeTarget === null || isPlayerCaptain === captainChangeTarget
		)

	// Registered means signed, plus paid under per-player pricing; the
	// season decides which.
	const isPlayerRegistered = useMemo(
		() =>
			isPlayerRegisteredForSeason(
				playerSeasonSnapshot?.data(),
				currentSeasonQueryDocumentSnapshot?.data()
			),
		[playerSeasonSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const demoteFromCaptainOnClickHandler =
		useCallback(async (): Promise<boolean> => {
			if (!playerSnapshot?.id || !canonicalTeamId) {
				toast.error('Missing required data to demote captain')
				return false
			}

			try {
				await updateTeamRosterViaFunction({
					teamId: canonicalTeamId,
					playerId: playerSnapshot.id,
					action: 'demote',
				})

				logger.userAction('captain_demoted', 'ManageTeamRosterPlayer', {
					playerId: playerSnapshot?.id,
					teamId: canonicalTeamId,
					playerName: playerSnapshot?.data()?.firstname,
				})
				logger.firebase('demoteFromCaptain', 'teams', undefined, {
					playerId: playerSnapshot?.id,
					teamId: canonicalTeamId,
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
				return true
			} catch (error) {
				logger.error(
					'Demote captain failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageTeamRosterPlayer',
						action: 'demote_captain',
						playerId: playerSnapshot?.id,
						teamId: canonicalTeamId,
					}
				)
				toast.error('Captain not demoted', {
					description: errorMessage(
						error,
						'Unable to demote captain. Please try again.'
					),
				})
				return false
			}
		}, [canonicalTeamId, playerSnapshot])

	const promoteToCaptainOnClickHandler =
		useCallback(async (): Promise<boolean> => {
			if (!playerSnapshot?.id || !canonicalTeamId) {
				toast.error('Missing required data to promote captain')
				return false
			}

			try {
				await updateTeamRosterViaFunction({
					teamId: canonicalTeamId,
					playerId: playerSnapshot.id,
					action: 'promote',
				})

				logger.userAction('captain_promoted', 'ManageTeamRosterPlayer', {
					playerId: playerSnapshot?.id,
					teamId: canonicalTeamId,
					playerName: playerSnapshot?.data()?.firstname,
				})
				logger.firebase('promoteToCaptain', 'teams', undefined, {
					playerId: playerSnapshot?.id,
					teamId: canonicalTeamId,
				})
				toast.success('Congratulations', {
					description: `${
						playerSnapshot?.data()?.firstname ?? 'Player'
					} has been promoted to team captain.`,
				})
				return true
			} catch (error) {
				logger.error(
					'Promote captain failed',
					error instanceof Error ? error : new Error(String(error)),
					{
						component: 'ManageTeamRosterPlayer',
						action: 'promote_captain',
						playerId: playerSnapshot?.id,
						teamId: canonicalTeamId,
					}
				)
				toast.error('Captain not promoted', {
					description: errorMessage(
						error,
						'Unable to promote captain. Ensure your email is verified and try again.'
					),
				})
				return false
			}
		}, [canonicalTeamId, playerSnapshot])

	const removeFromTeamOnClickHandler = useCallback(async () => {
		if (!playerSnapshot?.id || !canonicalTeamId) {
			toast.error('Missing required data to remove player')
			return
		}

		try {
			await updateTeamRosterViaFunction({
				teamId: canonicalTeamId,
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
					teamId: canonicalTeamId,
				}
			)
			toast.error('Player not removed', {
				description: errorMessage(
					error,
					'Unable to remove player. Please try again.'
				),
			})
		}
	}, [canonicalTeamId, playerSnapshot])

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
							variant={isPlayerRegistered ? 'secondary' : 'outline'}
						>
							{isPlayerRegistered ? 'registered' : 'unregistered'}
						</Badge>
						{isAuthenticatedUserCaptain && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size={'sm'}
										variant={'ghost'}
										className='h-8 w-8'
										disabled={isChangingCaptain}
										aria-busy={isChangingCaptain}
										aria-label={
											isChangingCaptain
												? `Updating ${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`
												: `Manage ${playerSnapshot.data()?.firstname} ${playerSnapshot.data()?.lastname}`
										}
									>
										{isChangingCaptain ? (
											<LoadingSpinner size='sm' withMargin={false} />
										) : (
											<DotsVerticalIcon className='h-4 w-4' />
										)}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className={'w-56'} align='end'>
									<DropdownMenuGroup>
										<DropdownMenuItem
											disabled={!isPlayerCaptain}
											onClick={() => {
												setCaptainChangeTarget(false)
												void runCaptainChange(demoteFromCaptainOnClickHandler)
											}}
										>
											Demote from captain
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={isPlayerCaptain}
											onClick={() => {
												setCaptainChangeTarget(true)
												void runCaptainChange(promoteToCaptainOnClickHandler)
											}}
										>
											Promote to captain
										</DropdownMenuItem>
										<DestructiveConfirmationDialog
											title={
												playerSnapshot.id === authenticatedUserSnapshot?.id
													? 'Are you sure you want to leave?'
													: 'Are you sure?'
											}
											description={[
												playerSnapshot.id === authenticatedUserSnapshot?.id
													? 'You will not be able to rejoin until a captain accepts you back on to the roster.'
													: `${
															playerSnapshot.data()?.firstname
														} will not be able to rejoin until a captain accepts them back on to the roster.`,
												departurePaymentNote,
											]
												.filter(Boolean)
												.join(' ')}
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
