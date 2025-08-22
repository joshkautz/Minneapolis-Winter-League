import {
	DocumentReference,
	DocumentData,
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
import { useAuthContext } from '@/contexts/auth-context'
import { PlayerData } from '@/lib/interfaces'
import { useDocument } from 'react-firebase-hooks/firestore'
import { DestructiveConfirmationDialog } from '../destructive-confirmation-dialog'
import { toast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { useSeasonsContext } from '@/contexts/seasons-context'
import { useTeamsContext } from '@/contexts/teams-context'

export const ManageTeamRosterPlayer = ({
	playerRef,
}: {
	playerRef: DocumentReference<PlayerData, DocumentData>
}) => {
	const { authenticatedUserSnapshot } = useAuthContext()
	const { currentSeasonTeamsQuerySnapshot } = useTeamsContext()
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
	const [playerSnapshot] = useDocument(playerRef)

	const team = useMemo(
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

	const isAuthenticatedUserCaptain = useMemo(
		() =>
			team
				?.data()
				.roster.find((item) => item.player.id === authenticatedUserSnapshot?.id)
				?.captain,
		[team, authenticatedUserSnapshot]
	)

	const isPlayerCaptain = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.captain,
		[playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isPlayerPaid = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
				)?.paid,
		[playerSnapshot, currentSeasonQueryDocumentSnapshot]
	)

	const isPlayerSigned = useMemo(
		() =>
			playerSnapshot
				?.data()
				?.seasons.find(
					(item) => item.season.id === currentSeasonQueryDocumentSnapshot?.id
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
					toast({
						title: `${
							playerSnapshot?.data()?.firstname ?? 'Player'
						} is no longer a team captain`,
						description: `They are still on your roster. You may be promote them back at any time.`,
					})
				})
				.catch((error) => {
					toast({
						title: 'Unable to Demote',
						description: error.message,
						variant: 'destructive',
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
					toast({
						title: 'Congratulations',
						description: `${
							playerSnapshot?.data()?.firstname ?? 'Player'
						} has been promoted to team captain.`,
					})
				})
				.catch(() => {
					toast({
						title: 'Unable to Promote',
						description:
							'Ensure your email is verified. Please try again later.',
						variant: 'destructive',
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
				toast({
					title: `${
						playerSnapshot?.data()?.firstname ?? 'Player'
					} has left the team`,
					description: 'Send player invites to build up your roster.',
				})
			})
			.catch((error) => {
				toast({
					title: 'Unable to Remove',
					description: error.message,
					variant: 'destructive',
				})
			})
	}, [team, playerSnapshot, currentSeasonQueryDocumentSnapshot])

	return (
		<div>
			{playerSnapshot ? (
				<div className="flex items-end gap-2 py-2">
					<div className="flex flex-row items-center">
						<p className="mr-2 select-none">
							{playerSnapshot.data()?.firstname}{' '}
							{playerSnapshot.data()?.lastname}{' '}
						</p>
						{isPlayerCaptain && <StarFilledIcon className="text-primary" />}
					</div>
					<div className="flex justify-end flex-1 gap-2">
						<div className="flex items-center">
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
												className="focus:bg-destructive focus:text-destructive-foreground"
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
				<div className="flex items-end gap-2 py-2">
					<div className="mr-2">
						<Skeleton className="h-4 w-[250px]" />
					</div>
				</div>
			)}
		</div>
	)
}
