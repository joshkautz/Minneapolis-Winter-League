/**
 * Team Edit Dialog component for admin team management
 *
 * Allows admins to:
 * - Edit team name
 * - Manage roster (add/remove players, change captain status)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { collection, Query, getDocs } from 'firebase/firestore'
import {
	Pencil,
	Users,
	Loader2,
	UserPlus,
	Trash2,
	Star,
	StarOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { firestore } from '@/firebase/app'
import { DocumentReference } from '@/firebase'
import { logger } from '@/shared/utils'
import {
	teamRosterSubcollection,
	teamSeasonRef,
} from '@/firebase/collections/teams'
import { playerSeasonRef } from '@/firebase/collections/players'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { updateTeamAdminViaFunction } from '@/firebase/collections/functions'
import {
	TeamDocument,
	PlayerDocument,
	Collections,
	TeamRosterDocument,
} from '@/types'

interface TeamEditDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamDocId: string
	teamName: string
	teamRef: DocumentReference<TeamDocument>
	seasonId: string
}

export const TeamEditDialog = ({
	open,
	onOpenChange,
	teamDocId,
	teamName: initialTeamName,
	teamRef,
	seasonId,
}: TeamEditDialogProps) => {
	void teamRef
	// Fetch team season subdoc for real-time data
	const [teamSeasonSnapshot, teamLoading, teamError] = useDocument(
		open ? teamSeasonRef(teamDocId, seasonId) : null
	)
	const [rosterSnapshot] = useCollection(
		open ? teamRosterSubcollection(teamDocId, seasonId) : null
	)

	// Fetch all players
	const [allPlayersSnapshot] = useCollection(
		open
			? (collection(firestore, Collections.PLAYERS) as Query<PlayerDocument>)
			: null
	)

	// Log errors
	useEffect(() => {
		if (teamError) {
			logger.error('Failed to load team:', {
				component: 'TeamEditDialog',
				teamDocId,
				error: teamError.message,
			})
			toast.error('Failed to load team data', {
				description: teamError.message,
			})
		}
	}, [teamError, teamDocId])

	// Form state
	const [teamName, setTeamName] = useState(initialTeamName)
	const [isSavingName, setIsSavingName] = useState(false)

	// Roster state
	const [playerSearchQuery, setPlayerSearchQuery] = useState('')
	const [isAddingPlayer, setIsAddingPlayer] = useState(false)
	const [playerToRemove, setPlayerToRemove] = useState<{
		playerId: string
		playerName: string
		isCaptain: boolean
	} | null>(null)
	const [isRemovingPlayer, setIsRemovingPlayer] = useState(false)
	const [captainChangeInProgress, setCaptainChangeInProgress] = useState<
		string | null
	>(null)

	// Reset form when dialog opens
	useEffect(() => {
		if (open) {
			setTeamName(initialTeamName)
			setPlayerSearchQuery('')
			setPlayerToRemove(null)
		}
	}, [open, initialTeamName])
	void teamSeasonSnapshot

	// Get current roster from roster subcollection (joined with player season for captain)
	const currentRoster = useMemo(() => {
		if (!rosterSnapshot) return [] as Array<TeamRosterDocument & { id: string }>
		return rosterSnapshot.docs.map(
			(d) => ({ id: d.id, ...d.data() }) as TeamRosterDocument & { id: string }
		)
	}, [rosterSnapshot])
	const [captainMap, setCaptainMap] = useState<Record<string, boolean>>({})
	useEffect(() => {
		let cancelled = false
		const fetchCaptains = async () => {
			const entries: [string, boolean][] = []
			for (const r of currentRoster) {
				const ref = playerSeasonRef(r.player.id, seasonId)
				if (!ref) {
					entries.push([r.player.id, false])
					continue
				}
				try {
					const ps = await import('firebase/firestore').then(({ getDoc }) =>
						getDoc(ref)
					)
					entries.push([r.player.id, ps.data()?.captain === true])
				} catch {
					entries.push([r.player.id, false])
				}
			}
			if (!cancelled) setCaptainMap(Object.fromEntries(entries))
		}
		fetchCaptains()
		return () => {
			cancelled = true
		}
	}, [currentRoster, seasonId])

	// Get roster player details
	const rosterWithDetails = useMemo(() => {
		if (!currentRoster.length || !allPlayersSnapshot) return []

		return currentRoster
			.map((rosterPlayer) => {
				const playerDoc = allPlayersSnapshot.docs.find(
					(doc) => doc.id === rosterPlayer.player.id
				)
				if (!playerDoc) return null

				const playerData = playerDoc.data()
				return {
					playerId: playerDoc.id,
					playerName:
						`${playerData.firstname || ''} ${playerData.lastname || ''}`.trim(),
					captain: captainMap[rosterPlayer.player.id] === true,
				}
			})
			.filter(Boolean) as {
			playerId: string
			playerName: string
			captain: boolean
		}[]
	}, [currentRoster, allPlayersSnapshot, captainMap])

	// Count captains
	const captainCount = useMemo(
		() => rosterWithDetails.filter((p) => p.captain).length,
		[rosterWithDetails]
	)

	// Search players for adding to roster
	const playerSearchResults = useMemo(() => {
		if (!playerSearchQuery.trim() || !allPlayersSnapshot) return []

		const searchLower = playerSearchQuery.toLowerCase()
		const currentRosterIds = new Set(currentRoster.map((r) => r.player.id))

		return allPlayersSnapshot.docs
			.filter((doc) => {
				// Skip players already on this team's roster
				if (currentRosterIds.has(doc.id)) return false

				const data = doc.data()
				const fullName =
					`${data.firstname || ''} ${data.lastname || ''}`.toLowerCase()

				// Check if name matches
				if (!fullName.includes(searchLower)) return false

				return true
			})
			.slice(0, 10)
			.map((doc) => {
				const data = doc.data()
				return {
					playerId: doc.id,
					playerName: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
				}
			})
	}, [playerSearchQuery, allPlayersSnapshot, currentRoster])
	void getDocs
	void seasonId

	// Handle name save
	const handleSaveName = useCallback(async () => {
		if (!teamName.trim() || teamName.trim() === initialTeamName) return

		setIsSavingName(true)
		try {
			await updateTeamAdminViaFunction({
				teamDocId,
				name: teamName.trim(),
			})
			toast.success('Team name updated')
		} catch (error) {
			logger.error('Failed to update team name:', error)
			toast.error('Failed to update team name', {
				description: error instanceof Error ? error.message : 'Unknown error',
			})
		} finally {
			setIsSavingName(false)
		}
	}, [teamName, initialTeamName, teamDocId])

	// Handle add player
	const handleAddPlayer = useCallback(
		async (playerId: string, playerName: string) => {
			setIsAddingPlayer(true)
			try {
				await updateTeamAdminViaFunction({
					teamDocId,
					rosterChanges: {
						addPlayers: [{ playerId, captain: false }],
					},
				})
				toast.success(`${playerName} added to team`)
				setPlayerSearchQuery('')
			} catch (error) {
				logger.error('Failed to add player:', error)
				toast.error('Failed to add player', {
					description: error instanceof Error ? error.message : 'Unknown error',
				})
			} finally {
				setIsAddingPlayer(false)
			}
		},
		[teamDocId]
	)

	// Handle remove player
	const handleRemovePlayer = useCallback(async () => {
		if (!playerToRemove) return

		setIsRemovingPlayer(true)
		try {
			await updateTeamAdminViaFunction({
				teamDocId,
				rosterChanges: {
					removePlayers: [playerToRemove.playerId],
				},
			})
			toast.success(`${playerToRemove.playerName} removed from team`)
			setPlayerToRemove(null)
		} catch (error) {
			logger.error('Failed to remove player:', error)
			toast.error('Failed to remove player', {
				description: error instanceof Error ? error.message : 'Unknown error',
			})
		} finally {
			setIsRemovingPlayer(false)
		}
	}, [playerToRemove, teamDocId])

	// Handle captain toggle
	const handleCaptainToggle = useCallback(
		async (playerId: string, currentCaptain: boolean) => {
			// Prevent demoting last captain
			if (currentCaptain && captainCount <= 1) {
				toast.error('Cannot demote the last captain', {
					description: 'Promote another player first',
				})
				return
			}

			setCaptainChangeInProgress(playerId)
			try {
				await updateTeamAdminViaFunction({
					teamDocId,
					rosterChanges: {
						updateCaptainStatus: [{ playerId, captain: !currentCaptain }],
					},
				})
				toast.success(
					currentCaptain
						? 'Captain status removed'
						: 'Player promoted to captain'
				)
			} catch (error) {
				logger.error('Failed to update captain status:', error)
				toast.error('Failed to update captain status', {
					description: error instanceof Error ? error.message : 'Unknown error',
				})
			} finally {
				setCaptainChangeInProgress(null)
			}
		},
		[teamDocId, captainCount]
	)

	const hasNameChanges = teamName.trim() !== initialTeamName

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='max-w-2xl max-h-[90vh] overflow-hidden flex flex-col'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<Pencil className='h-5 w-5' />
							Edit Team: {initialTeamName}
						</DialogTitle>
						<DialogDescription>
							Manage team settings, history, and roster
						</DialogDescription>
					</DialogHeader>

					<ScrollArea className='flex-1 pr-4'>
						<div className='space-y-6 pb-4'>
							{/* Section 1: Basic Information */}
							<div className='space-y-4'>
								<h3 className='text-sm font-medium flex items-center gap-2'>
									<Pencil className='h-4 w-4' />
									Basic Information
								</h3>
								<div className='space-y-2'>
									<Label htmlFor='team-name'>Team Name</Label>
									<div className='flex gap-2'>
										<Input
											id='team-name'
											value={teamName}
											onChange={(e) => setTeamName(e.target.value)}
											placeholder='Enter team name'
										/>
										<Button
											onClick={handleSaveName}
											disabled={!hasNameChanges || isSavingName}
										>
											{isSavingName ? (
												<Loader2 className='h-4 w-4 animate-spin' />
											) : (
												'Save'
											)}
										</Button>
									</div>
								</div>
							</div>

							<Separator />

							{/* Section 3: Roster Management */}
							<div className='space-y-4'>
								<h3 className='text-sm font-medium flex items-center gap-2'>
									<Users className='h-4 w-4' />
									Roster Management
								</h3>

								{/* Current Roster */}
								<div className='space-y-2'>
									<Label>Current Roster ({rosterWithDetails.length})</Label>
									{teamLoading ? (
										<div className='flex items-center justify-center py-4'>
											<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
										</div>
									) : rosterWithDetails.length === 0 ? (
										<p className='text-sm text-muted-foreground text-center py-4'>
											No players on roster
										</p>
									) : (
										<div className='border rounded-md divide-y'>
											{rosterWithDetails.map((player) => (
												<div
													key={player.playerId}
													className='flex items-center justify-between p-3'
												>
													<div className='flex items-center gap-2'>
														<span>{player.playerName}</span>
														{player.captain && (
															<Badge variant='secondary' className='text-xs'>
																Captain
															</Badge>
														)}
													</div>
													<div className='flex items-center gap-1'>
														<Button
															size='sm'
															variant='ghost'
															onClick={() =>
																handleCaptainToggle(
																	player.playerId,
																	player.captain
																)
															}
															disabled={
																captainChangeInProgress === player.playerId
															}
															title={
																player.captain
																	? 'Remove captain status'
																	: 'Promote to captain'
															}
														>
															{captainChangeInProgress === player.playerId ? (
																<Loader2 className='h-4 w-4 animate-spin' />
															) : player.captain ? (
																<StarOff className='h-4 w-4' />
															) : (
																<Star className='h-4 w-4' />
															)}
														</Button>
														<Button
															size='sm'
															variant='ghost'
															className='text-destructive hover:text-destructive'
															onClick={() =>
																setPlayerToRemove({
																	playerId: player.playerId,
																	playerName: player.playerName,
																	isCaptain: player.captain,
																})
															}
															title='Remove from team'
														>
															<Trash2 className='h-4 w-4' />
														</Button>
													</div>
												</div>
											))}
										</div>
									)}
								</div>

								{/* Add Player */}
								<div className='space-y-2'>
									<Label htmlFor='player-search'>Add Player</Label>
									<div className='relative'>
										<UserPlus className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
										<Input
											id='player-search'
											value={playerSearchQuery}
											onChange={(e) => setPlayerSearchQuery(e.target.value)}
											placeholder='Search players by name...'
											className='pl-9'
											disabled={isAddingPlayer}
										/>
									</div>
									{playerSearchResults.length > 0 && (
										<div className='border rounded-md divide-y'>
											{playerSearchResults.map((player) => (
												<div
													key={player.playerId}
													className='flex items-center justify-between p-3 hover:bg-muted/50'
												>
													<span>{player.playerName}</span>
													<Button
														size='sm'
														variant='outline'
														onClick={() =>
															handleAddPlayer(
																player.playerId,
																player.playerName
															)
														}
														disabled={isAddingPlayer}
													>
														{isAddingPlayer ? (
															<Loader2 className='h-4 w-4 animate-spin' />
														) : (
															<>
																<UserPlus className='h-4 w-4 mr-1' />
																Add
															</>
														)}
													</Button>
												</div>
											))}
										</div>
									)}
									{playerSearchQuery.trim() &&
										playerSearchResults.length === 0 && (
											<p className='text-sm text-muted-foreground text-center py-4'>
												No available players found matching "{playerSearchQuery}
												"
											</p>
										)}
								</div>
							</div>
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>

			{/* Remove Player Confirmation Dialog */}
			<AlertDialog
				open={!!playerToRemove}
				onOpenChange={() => setPlayerToRemove(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove Player</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to remove{' '}
							<strong>{playerToRemove?.playerName}</strong> from the team?
							{playerToRemove?.isCaptain && captainCount <= 1 && (
								<span className='block mt-2 text-destructive'>
									Warning: This player is the only captain. You must promote
									another player first.
								</span>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isRemovingPlayer}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleRemovePlayer}
							disabled={
								isRemovingPlayer ||
								(playerToRemove?.isCaptain && captainCount <= 1)
							}
							className='bg-destructive hover:bg-destructive/90'
						>
							{isRemovingPlayer ? (
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							) : (
								<Trash2 className='h-4 w-4 mr-2' />
							)}
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
