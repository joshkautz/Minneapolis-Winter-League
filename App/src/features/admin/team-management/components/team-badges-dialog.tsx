import { useState, useEffect } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import { Award, Plus, X, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { logger } from '@/shared/utils'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
	awardBadgeViaFunction,
	revokeBadgeViaFunction,
} from '@/firebase/collections/functions'
import { allBadgesQuery, teamBadgesQuery } from '@/firebase/collections/badges'
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
	const [teamBadgesSnapshot, teamBadgesLoading] = useCollection(
		open ? teamBadgesQuery(teamRef) : null
	)

	// Fetch all available badges
	const [allBadgesSnapshot, allBadgesLoading] = useCollection(
		open ? allBadgesQuery() : null
	)

	// Processed team badges
	const [teamBadges, setTeamBadges] = useState<ProcessedTeamBadge[]>([])
	const [isProcessing, setIsProcessing] = useState(false)

	// Available badges (not yet awarded to team)
	const [availableBadges, setAvailableBadges] = useState<AvailableBadge[]>([])

	// Dialog state
	const [showAddBadges, setShowAddBadges] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)

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
						logger.error(`Error processing team badge ${badgeId}:`, error)
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
		setIsSubmitting(true)
		try {
			const result = await awardBadgeViaFunction({
				badgeId,
				teamId,
			})
			toast.success(result.message)
			setShowAddBadges(false)
		} catch (error) {
			logger.error('Error awarding badge:', error)
			let errorMessage = 'Failed to award badge'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			}
			toast.error(errorMessage)
		} finally {
			setIsSubmitting(false)
		}
	}

	// Revoke badge from team
	const handleRevokeBadge = async (badgeId: string) => {
		try {
			const result = await revokeBadgeViaFunction({
				badgeId,
				teamId,
			})
			toast.success(result.message)
		} catch (error) {
			logger.error('Error revoking badge:', error)
			let errorMessage = 'Failed to remove badge'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			}
			toast.error(errorMessage)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl'>
				<DialogHeader>
					<DialogTitle>Manage Badges: {teamName}</DialogTitle>
					<DialogDescription>
						Award or revoke badges for this team
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4 py-4'>
					{/* Current Badges Section */}
					<div>
						<div className='flex items-center justify-between mb-3'>
							<h3 className='font-semibold text-sm'>Current Badges</h3>
							{!showAddBadges && (
								<Button
									size='sm'
									onClick={() => setShowAddBadges(true)}
									disabled={availableBadges.length === 0}
								>
									<Plus className='h-4 w-4 mr-2' />
									Add Badge
								</Button>
							)}
						</div>

						{teamBadgesLoading || isProcessing ? (
							<div className='flex items-center justify-center py-8'>
								<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
							</div>
						) : teamBadges.length === 0 ? (
							<div className='text-center py-8 border rounded-lg'>
								<Award className='h-12 w-12 mx-auto text-muted-foreground/50 mb-3' />
								<p className='text-sm text-muted-foreground'>
									No badges earned yet
								</p>
							</div>
						) : (
							<div className='space-y-2 max-h-[300px] overflow-y-auto'>
								{teamBadges.map((badge) => (
									<div
										key={badge.id}
										className='flex items-start gap-3 p-3 border rounded-lg'
									>
										{/* Badge Image */}
										<div className='flex-shrink-0'>
											{badge.imageUrl ? (
												<img
													src={badge.imageUrl}
													alt={badge.name}
													className='w-12 h-12 object-cover rounded'
												/>
											) : (
												<div className='w-12 h-12 bg-muted rounded flex items-center justify-center'>
													<Award className='h-6 w-6 text-muted-foreground' />
												</div>
											)}
										</div>

										{/* Badge Info */}
										<div className='flex-1 min-w-0'>
											<h4 className='font-medium text-sm'>{badge.name}</h4>
											<p className='text-xs text-muted-foreground mt-1 line-clamp-2'>
												{badge.description}
											</p>
											<div className='flex items-center gap-2 mt-2'>
												<Badge variant='secondary' className='text-xs'>
													Awarded{' '}
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
											variant='ghost'
											size='sm'
											onClick={() => handleRevokeBadge(badge.id)}
										>
											<X className='h-4 w-4' />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Add Badges Section */}
					{showAddBadges && (
						<div>
							<div className='flex items-center justify-between mb-3'>
								<h3 className='font-semibold text-sm'>Available Badges</h3>
								<Button
									variant='outline'
									size='sm'
									onClick={() => setShowAddBadges(false)}
								>
									Cancel
								</Button>
							</div>

							{allBadgesLoading ? (
								<div className='flex items-center justify-center py-8'>
									<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
								</div>
							) : availableBadges.length === 0 ? (
								<div className='text-center py-8 border rounded-lg'>
									<Lock className='h-12 w-12 mx-auto text-muted-foreground/50 mb-3' />
									<p className='text-sm text-muted-foreground'>
										All available badges have been earned!
									</p>
								</div>
							) : (
								<div className='space-y-2 max-h-[300px] overflow-y-auto'>
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
														className='w-12 h-12 object-cover rounded'
													/>
												) : (
													<div className='w-12 h-12 bg-muted rounded flex items-center justify-center'>
														<Award className='h-6 w-6 text-muted-foreground' />
													</div>
												)}
											</div>

											{/* Badge Info */}
											<div className='flex-1 min-w-0'>
												<h4 className='font-medium text-sm'>{badge.name}</h4>
												<p className='text-xs text-muted-foreground mt-1'>
													{badge.description}
												</p>
											</div>

											{/* Award Button */}
											<Button
												size='sm'
												onClick={() => handleAwardBadge(badge.id)}
												disabled={isSubmitting}
											>
												{isSubmitting ? (
													<Loader2 className='h-4 w-4 mr-1 animate-spin' />
												) : (
													<Award className='h-4 w-4 mr-1' />
												)}
												Award
											</Button>
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
