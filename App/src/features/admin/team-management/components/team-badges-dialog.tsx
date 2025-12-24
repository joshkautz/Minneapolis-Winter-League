import { useState, useEffect } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import { Award, Trash2, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { logger } from '@/shared/utils'
import { useBadgesContext } from '@/providers'
import { Button } from '@/components/ui/button'
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
import {
	awardBadgeViaFunction,
	revokeBadgeViaFunction,
} from '@/firebase/collections/functions'
import { teamBadgesQuery } from '@/firebase/collections/badges'
import {
	BadgeDocument,
	TeamBadgeDocument,
	PlayerDocument,
	TeamDocument,
} from '@/types'
import { DocumentReference } from '@/firebase/firestore'

interface ProcessedTeamBadge {
	id: string
	name: string
	description: string
	imageUrl: string | null
	awardedAt: Date
	awardedByName: string
}

interface AvailableBadge {
	id: string
	name: string
	description: string
	imageUrl: string | null
}

interface TeamBadgesDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamId: string
	teamName: string
	teamRef: DocumentReference<TeamDocument>
}

export const TeamBadgesDialog = ({
	open,
	onOpenChange,
	teamId,
	teamName,
	teamRef,
}: TeamBadgesDialogProps) => {
	// Fetch team's badges
	const [teamBadgesSnapshot, teamBadgesLoading, teamBadgesError] =
		useCollection(open ? teamBadgesQuery(teamRef) : null)

	// Get all badges from context (pre-loaded)
	const {
		allBadgesQuerySnapshot: allBadgesSnapshot,
		allBadgesQuerySnapshotLoading: allBadgesLoading,
	} = useBadgesContext()

	// Log and notify on query errors
	useEffect(() => {
		if (teamBadgesError) {
			logger.error('Failed to load team badges:', {
				component: 'TeamBadgesDialog',
				teamId,
				error: teamBadgesError.message,
			})
			toast.error('Failed to load team badges', {
				description: teamBadgesError.message,
			})
		}
	}, [teamBadgesError, teamId])

	// Processed team badges
	const [teamBadges, setTeamBadges] = useState<ProcessedTeamBadge[]>([])
	const [isProcessing, setIsProcessing] = useState(false)

	// Available badges (not yet awarded to team)
	const [availableBadges, setAvailableBadges] = useState<AvailableBadge[]>([])

	// Track which badge is currently being awarded (for loading state)
	const [awardingBadgeId, setAwardingBadgeId] = useState<string | null>(null)

	// Badge removal confirmation state
	const [badgeToRemove, setBadgeToRemove] = useState<{
		id: string
		name: string
	} | null>(null)
	const [isRemoving, setIsRemoving] = useState(false)

	// Process team badges to resolve references
	useEffect(() => {
		if (!teamBadgesSnapshot) {
			setTeamBadges([])
			setIsProcessing(false)
			return
		}

		setIsProcessing(true)

		const processTeamBadges = async () => {
			const results = await Promise.all(
				teamBadgesSnapshot.docs.map(async (teamBadgeDoc) => {
					const teamBadgeData = teamBadgeDoc.data() as TeamBadgeDocument
					const badgeId = teamBadgeDoc.id

					try {
						// Fetch badge data
						const badgeDoc = await getDoc(teamBadgeData.badge)
						const badgeData = badgeDoc.data() as BadgeDocument | undefined

						// Fetch awarded by player data
						const awardedByDoc = await getDoc(teamBadgeData.awardedBy)
						const awardedByData = awardedByDoc.data() as
							| PlayerDocument
							| undefined
						const awardedByName = awardedByData
							? `${awardedByData.firstname} ${awardedByData.lastname}`
							: 'Unknown'

						if (!badgeData) {
							throw new Error('Badge not found')
						}

						return {
							id: badgeId,
							name: badgeData.name,
							description: badgeData.description,
							imageUrl: badgeData.imageUrl,
							awardedAt: teamBadgeData.awardedAt.toDate(),
							awardedByName,
						} as ProcessedTeamBadge
					} catch (error) {
						logger.error(`Error processing team badge ${badgeId}:`, error as Error)
						return null
					}
				})
			)

			// Filter out null results
			const validResults = results.filter(
				(badge): badge is ProcessedTeamBadge => badge !== null
			)

			// Sort by awarded date (most recent first)
			validResults.sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime())

			setTeamBadges(validResults)
			setIsProcessing(false)
		}

		processTeamBadges()
	}, [teamBadgesSnapshot])

	// Calculate available badges (not yet awarded)
	useEffect(() => {
		if (!allBadgesSnapshot || !teamBadgesSnapshot) {
			setAvailableBadges([])
			return
		}

		const earnedBadgeIds = new Set(teamBadgesSnapshot.docs.map((doc) => doc.id))

		const available = allBadgesSnapshot.docs
			.filter((badgeDoc) => !earnedBadgeIds.has(badgeDoc.id))
			.map((badgeDoc) => {
				const badgeData = badgeDoc.data() as BadgeDocument
				return {
					id: badgeDoc.id,
					name: badgeData.name,
					description: badgeData.description,
					imageUrl: badgeData.imageUrl,
				} as AvailableBadge
			})
			// Sort alphabetically
			.sort((a, b) => a.name.localeCompare(b.name))

		setAvailableBadges(available)
	}, [allBadgesSnapshot, teamBadgesSnapshot])

	// Award badge to team
	const handleAwardBadge = async (badgeId: string) => {
		setAwardingBadgeId(badgeId)
		try {
			const result = await awardBadgeViaFunction({
				badgeId,
				teamId,
			})
			toast.success(result.message)
		} catch (error) {
			logger.error('Error awarding badge:', error as Error)
			let errorMessage = 'Failed to award badge'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			}
			toast.error(errorMessage)
		} finally {
			setAwardingBadgeId(null)
		}
	}

	// Handle remove button click - opens confirmation dialog
	const handleRemoveClick = (badgeId: string, badgeName: string) => {
		setBadgeToRemove({ id: badgeId, name: badgeName })
	}

	// Confirm badge removal
	const handleConfirmRemove = async () => {
		if (!badgeToRemove) return

		setIsRemoving(true)
		try {
			const result = await revokeBadgeViaFunction({
				badgeId: badgeToRemove.id,
				teamId,
			})
			toast.success(result.message)
			setBadgeToRemove(null)
		} catch (error) {
			logger.error('Error revoking badge:', error as Error)
			let errorMessage = 'Failed to remove badge'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			}
			toast.error(errorMessage)
		} finally {
			setIsRemoving(false)
		}
	}

	const isLoading = teamBadgesLoading || isProcessing || allBadgesLoading

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='max-w-2xl max-h-[85vh] flex flex-col'>
					<DialogHeader>
						<DialogTitle>Manage Badges: {teamName}</DialogTitle>
						<DialogDescription>
							Award or remove badges for this team
						</DialogDescription>
					</DialogHeader>

					{isLoading ? (
						<div className='flex items-center justify-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
						</div>
					) : (
						<div className='space-y-6 overflow-y-auto flex-1 pr-2'>
							{/* Current Badges Section */}
							<div>
								<h3 className='font-semibold text-sm mb-3 flex items-center gap-2'>
									<Award className='h-4 w-4' />
									Awarded Badges ({teamBadges.length})
								</h3>

								{teamBadges.length === 0 ? (
									<div className='text-center py-6 border rounded-lg bg-muted/30'>
										<p className='text-sm text-muted-foreground'>
											No badges awarded yet
										</p>
									</div>
								) : (
									<div className='space-y-2'>
										{teamBadges.map((badge) => (
											<div
												key={badge.id}
												className='flex items-start gap-3 p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
											>
												{/* Badge Image */}
												<div className='flex-shrink-0'>
													{badge.imageUrl ? (
														<img
															src={badge.imageUrl}
															alt={badge.name}
															className='w-10 h-10 object-cover rounded'
														/>
													) : (
														<div className='w-10 h-10 bg-muted rounded flex items-center justify-center'>
															<Award className='h-5 w-5 text-muted-foreground' />
														</div>
													)}
												</div>

												{/* Badge Info */}
												<div className='flex-1 min-w-0'>
													<h4 className='font-medium text-sm'>{badge.name}</h4>
													<p className='text-xs text-muted-foreground mt-0.5 line-clamp-1'>
														{badge.description}
													</p>
													<div className='flex items-center gap-2 mt-1.5 flex-wrap'>
														<Badge variant='secondary' className='text-xs'>
															{formatDistanceToNow(badge.awardedAt, {
																addSuffix: true,
															})}
														</Badge>
														<span className='text-xs text-muted-foreground'>
															by {badge.awardedByName}
														</span>
													</div>
												</div>

												{/* Remove Button */}
												<Button
													variant='destructive'
													size='sm'
													onClick={() =>
														handleRemoveClick(badge.id, badge.name)
													}
													className='flex-shrink-0'
												>
													<Trash2 className='h-4 w-4 sm:mr-1' />
													<span className='hidden sm:inline'>Remove</span>
												</Button>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Available Badges Section */}
							<div>
								<h3 className='font-semibold text-sm mb-3 flex items-center gap-2'>
									<Award className='h-4 w-4' />
									Available Badges ({availableBadges.length})
								</h3>

								{availableBadges.length === 0 ? (
									<div className='text-center py-6 border rounded-lg bg-muted/30'>
										<CheckCircle className='h-8 w-8 mx-auto text-green-600 mb-2' />
										<p className='text-sm text-muted-foreground'>
											All badges have been awarded!
										</p>
									</div>
								) : (
									<div className='space-y-2'>
										{availableBadges.map((badge) => (
											<div
												key={badge.id}
												className='flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors'
											>
												{/* Badge Image */}
												<div className='flex-shrink-0'>
													{badge.imageUrl ? (
														<img
															src={badge.imageUrl}
															alt={badge.name}
															className='w-10 h-10 object-cover rounded'
														/>
													) : (
														<div className='w-10 h-10 bg-muted rounded flex items-center justify-center'>
															<Award className='h-5 w-5 text-muted-foreground' />
														</div>
													)}
												</div>

												{/* Badge Info */}
												<div className='flex-1 min-w-0'>
													<h4 className='font-medium text-sm'>{badge.name}</h4>
													<p className='text-xs text-muted-foreground mt-0.5 line-clamp-2'>
														{badge.description}
													</p>
												</div>

												{/* Award Button */}
												<Button
													size='sm'
													onClick={() => handleAwardBadge(badge.id)}
													disabled={awardingBadgeId !== null}
													className='flex-shrink-0'
												>
													{awardingBadgeId === badge.id ? (
														<Loader2 className='h-4 w-4 sm:mr-1 animate-spin' />
													) : (
														<Award className='h-4 w-4 sm:mr-1' />
													)}
													<span className='hidden sm:inline'>Award</span>
												</Button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Badge Removal Confirmation Dialog */}
			<AlertDialog
				open={!!badgeToRemove}
				onOpenChange={(open) => !open && setBadgeToRemove(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-red-600' />
							Remove Badge "{badgeToRemove?.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription className='space-y-2'>
							<p>
								This will remove the badge from {teamName}. The badge can be
								re-awarded later if needed.
							</p>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmRemove}
							disabled={isRemoving}
							className='bg-red-600 hover:bg-red-700'
						>
							{isRemoving ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									Removing...
								</>
							) : (
								<>
									<Trash2 className='h-4 w-4 mr-2' />
									Remove Badge
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
