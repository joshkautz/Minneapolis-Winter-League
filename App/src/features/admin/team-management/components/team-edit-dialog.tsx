/**
 * Team Edit Dialog component for admin team management
 *
 * Allows admins to:
 * - Edit team name
 * - Link team to another team's history (change teamId)
 * - Manage roster (add/remove players, change captain status)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { collection, Query, QueryDocumentSnapshot } from 'firebase/firestore'
import {
	Pencil,
	Link as LinkIcon,
	Users,
	Loader2,
	Search,
	UserPlus,
	Trash2,
	Star,
	StarOff,
	AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

import { firestore } from '@/firebase/app'
import { DocumentReference } from '@/firebase'
import { logger } from '@/shared/utils'
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
	TeamRosterPlayer,
} from '@/types'
import { useSeasonsContext } from '@/providers'

interface TeamEditDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamDocId: string
	teamName: string
	teamIdValue: string // The team's teamId field (for linking)
	teamRef: DocumentReference<TeamDocument>
	seasonId: string
}

export const TeamEditDialog = ({
	open,
	onOpenChange,
	teamDocId,
	teamName: initialTeamName,
	teamIdValue,
	teamRef,
	seasonId,
}: TeamEditDialogProps) => {
	// Fetch team document for real-time roster data
	const [teamSnapshot, teamLoading, teamError] = useDocument(
		open ? teamRef : null
	)

	// Fetch all players
	const [allPlayersSnapshot] = useCollection(
		open
			? (collection(firestore, Collections.PLAYERS) as Query<PlayerDocument>)
			: null
	)

	// Get seasons context
	const { seasonsQuerySnapshot } = useSeasonsContext()

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

	// Team linking state
	const [teamSearchQuery, setTeamSearchQuery] = useState('')
	const [isLinking, setIsLinking] = useState(false)
	const [teamToLink, setTeamToLink] = useState<{
		teamId: string
		teamName: string
		seasonName: string
	} | null>(null)

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
			setTeamSearchQuery('')
			setPlayerSearchQuery('')
			setTeamToLink(null)
			setPlayerToRemove(null)
		}
	}, [open, initialTeamName])

	// Fetch all teams for linking search
	const [allTeamsSnapshot] = useCollection(
		open
			? (collection(firestore, Collections.TEAMS) as Query<TeamDocument>)
			: null
	)

	// Get current roster from team snapshot
	const currentRoster = useMemo(() => {
		if (!teamSnapshot?.exists()) return []
		const data = teamSnapshot.data()
		return data?.roster || []
	}, [teamSnapshot])

	// Get roster player details
	const rosterWithDetails = useMemo(() => {
		if (!currentRoster.length || !allPlayersSnapshot) return []

		return currentRoster
			.map((rosterPlayer: TeamRosterPlayer) => {
				const playerDoc = allPlayersSnapshot.docs.find(
					(doc: QueryDocumentSnapshot<PlayerDocument>) =>
						doc.id === rosterPlayer.player.id
				)
				if (!playerDoc) return null

				const playerData = playerDoc.data()
				return {
					playerId: playerDoc.id,
					playerName: `${playerData.firstname || ''} ${playerData.lastname || ''}`.trim(),
					captain: rosterPlayer.captain,
				}
			})
			.filter(Boolean) as {
			playerId: string
			playerName: string
			captain: boolean
		}[]
	}, [currentRoster, allPlayersSnapshot])

	// Count captains
	const captainCount = useMemo(
		() => rosterWithDetails.filter((p) => p.captain).length,
		[rosterWithDetails]
	)

	// Search teams for linking
	const teamSearchResults = useMemo(() => {
		if (!teamSearchQuery.trim() || !allTeamsSnapshot) return []

		const searchLower = teamSearchQuery.toLowerCase()

		// Group teams by teamId and get the most relevant match
		const teamsByTeamId = new Map<
			string,
			{ teamId: string; teamName: string; seasonId: string; seasonName: string }
		>()

		allTeamsSnapshot.docs.forEach((doc) => {
			const data = doc.data()
			// Skip the current team
			if (data.teamId === teamIdValue) return

			// Check if name matches search
			if (!data.name.toLowerCase().includes(searchLower)) return

			// Get season name
			const seasonDoc = seasonsQuerySnapshot?.docs.find(
				(s) => s.id === data.season.id
			)
			const seasonName = seasonDoc?.data()?.name || 'Unknown Season'

			// Keep only one entry per teamId (prefer most recent by just overwriting)
			teamsByTeamId.set(data.teamId, {
				teamId: data.teamId,
				teamName: data.name,
				seasonId: data.season.id,
				seasonName,
			})
		})

		return Array.from(teamsByTeamId.values()).slice(0, 10)
	}, [teamSearchQuery, allTeamsSnapshot, teamIdValue, seasonsQuerySnapshot])

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

				// Check if player is on another team this season
				const seasonData = data.seasons?.find(
					(s) => s.season.id === seasonId
				)
				if (seasonData?.team) return false // Already on a team

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
	}, [playerSearchQuery, allPlayersSnapshot, currentRoster, seasonId])

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
				description:
					error instanceof Error ? error.message : 'Unknown error',
			})
		} finally {
			setIsSavingName(false)
		}
	}, [teamName, initialTeamName, teamDocId])

	// Handle team linking
	const handleLinkTeam = useCallback(async () => {
		if (!teamToLink) return

		setIsLinking(true)
		try {
			await updateTeamAdminViaFunction({
				teamDocId,
				linkToTeamId: teamToLink.teamId,
			})
			toast.success('Team history linked', {
				description: `This team is now linked to ${teamToLink.teamName}'s history`,
			})
			setTeamToLink(null)
			setTeamSearchQuery('')
		} catch (error) {
			logger.error('Failed to link team:', error)
			toast.error('Failed to link team', {
				description:
					error instanceof Error ? error.message : 'Unknown error',
			})
		} finally {
			setIsLinking(false)
		}
	}, [teamToLink, teamDocId])

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
					description:
						error instanceof Error ? error.message : 'Unknown error',
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
				description:
					error instanceof Error ? error.message : 'Unknown error',
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
					currentCaptain ? 'Captain status removed' : 'Player promoted to captain'
				)
			} catch (error) {
				logger.error('Failed to update captain status:', error)
				toast.error('Failed to update captain status', {
					description:
						error instanceof Error ? error.message : 'Unknown error',
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

							{/* Section 2: Team History (Linking) */}
							<div className='space-y-4'>
								<h3 className='text-sm font-medium flex items-center gap-2'>
									<LinkIcon className='h-4 w-4' />
									Team History
								</h3>
								<div className='text-sm text-muted-foreground'>
									<p>
										Current Team ID:{' '}
										<code className='bg-muted px-1 py-0.5 rounded text-xs'>
											{teamIdValue}
										</code>
									</p>
									<p className='mt-1'>
										Link this team to another team's history to connect their
										records across seasons.
									</p>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='team-search'>Search teams to link</Label>
									<div className='relative'>
										<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
										<Input
											id='team-search'
											value={teamSearchQuery}
											onChange={(e) => setTeamSearchQuery(e.target.value)}
											placeholder='Search by team name...'
											className='pl-9'
										/>
									</div>
									{teamSearchResults.length > 0 && (
										<div className='border rounded-md divide-y'>
											{teamSearchResults.map((team) => (
												<div
													key={team.teamId}
													className='flex items-center justify-between p-3 hover:bg-muted/50'
												>
													<div>
														<p className='font-medium'>{team.teamName}</p>
														<p className='text-sm text-muted-foreground'>
															{team.seasonName}
														</p>
													</div>
													<Button
														size='sm'
														variant='outline'
														onClick={() =>
															setTeamToLink({
																teamId: team.teamId,
																teamName: team.teamName,
																seasonName: team.seasonName,
															})
														}
													>
														<LinkIcon className='h-4 w-4 mr-1' />
														Link
													</Button>
												</div>
											))}
										</div>
									)}
									{teamSearchQuery.trim() && teamSearchResults.length === 0 && (
										<p className='text-sm text-muted-foreground text-center py-4'>
											No teams found matching "{teamSearchQuery}"
										</p>
									)}
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
												No available players found matching "{playerSearchQuery}"
											</p>
										)}
								</div>
							</div>
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>

			{/* Team Link Confirmation Dialog */}
			<AlertDialog open={!!teamToLink} onOpenChange={() => setTeamToLink(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center gap-2'>
							<AlertTriangle className='h-5 w-5 text-amber-500' />
							Link Team History
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will link <strong>{initialTeamName}</strong> to the history
							of <strong>{teamToLink?.teamName}</strong> ({teamToLink?.seasonName}
							).
							<br />
							<br />
							Teams with the same Team ID are considered the same team across
							seasons. This action will change this team's ID to match the
							selected team.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isLinking}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleLinkTeam} disabled={isLinking}>
							{isLinking ? (
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							) : (
								<LinkIcon className='h-4 w-4 mr-2' />
							)}
							Link Teams
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
