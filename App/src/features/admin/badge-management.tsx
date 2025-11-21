/**
 * Badge Management admin component
 *
 * Allows admins to create, edit, delete badges and award/revoke them from teams
 */

import React, { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Award,
	Plus,
	Pencil,
	Trash2,
	Image as ImageIcon,
	X,
	Loader2,
	Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import { allBadgesQuery } from '@/firebase/collections/badges'
import { teamsBySeasonQuery } from '@/firebase/collections/teams'
import { seasonsQuery } from '@/firebase/collections/seasons'
import { useSeasonsContext } from '@/providers'
import {
	createBadgeViaFunction,
	updateBadgeViaFunction,
	deleteBadgeViaFunction,
	awardBadgeViaFunction,
	revokeBadgeViaFunction,
} from '@/firebase/collections/functions'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	PageContainer,
	PageHeader,
	DestructiveConfirmationDialog,
	LoadingSpinner,
} from '@/shared/components'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	BadgeDocument,
	TeamDocument,
	PlayerDocument,
	SeasonDocument,
} from '@/types'
import { Badge } from '@/components/ui/badge'

interface ProcessedBadge {
	id: string
	name: string
	description: string
	imageUrl: string | null
	createdByName: string
	createdAt: Date
}

type DialogMode = 'create' | 'edit' | 'award' | 'closed'

export const BadgeManagement: React.FC = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading] = useDocument(playerRef)
	const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Fetch all badges
	const [badgesSnapshot, badgesLoading] = useCollection(allBadgesQuery())

	// Fetch all seasons
	const [seasonsSnapshot] = useCollection(seasonsQuery())
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Selected season for team queries
	const [selectedSeasonId, setSelectedSeasonId] = useState<string>(
		() => currentSeasonQueryDocumentSnapshot?.id || ''
	)

	// Update selected season when current season changes
	useEffect(() => {
		if (currentSeasonQueryDocumentSnapshot?.id && !selectedSeasonId) {
			setSelectedSeasonId(currentSeasonQueryDocumentSnapshot.id)
		}
	}, [currentSeasonQueryDocumentSnapshot?.id, selectedSeasonId])

	// Get the selected season's document reference for querying teams
	const selectedSeasonRef = seasons
		? seasonsSnapshot?.docs.find((doc) => doc.id === selectedSeasonId)
		: undefined

	// Fetch teams for selected season
	const [teamsSnapshot, teamsLoading] = useCollection(
		teamsBySeasonQuery(selectedSeasonRef?.ref)
	)

	const teams = teamsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		ref: doc.ref,
		...doc.data(),
	})) as (TeamDocument & { id: string })[] | undefined

	// Process badges to resolve references
	const [badgesList, setBadgesList] = useState<ProcessedBadge[]>([])
	const [isProcessing, setIsProcessing] = useState(false)

	useEffect(() => {
		if (!badgesSnapshot) {
			setBadgesList([])
			setIsProcessing(false)
			return
		}

		setIsProcessing(true)

		const processBadges = async () => {
			const results = await Promise.all(
				badgesSnapshot.docs.map(async (badgeDoc) => {
					const badgeData = badgeDoc.data() as BadgeDocument
					const badgeId = badgeDoc.id

					try {
						// Fetch creator data
						const creatorDoc = await getDoc(badgeData.createdBy)
						const creatorData = creatorDoc.data() as PlayerDocument | undefined
						const createdByName = creatorData
							? `${creatorData.firstname} ${creatorData.lastname}`
							: 'Unknown'

						return {
							id: badgeId,
							name: badgeData.name,
							description: badgeData.description,
							imageUrl: badgeData.imageUrl,
							createdByName,
							createdAt: badgeData.createdAt.toDate(),
						} as ProcessedBadge
					} catch (error) {
						console.error(`Error processing badge ${badgeId}:`, error)
						return {
							id: badgeId,
							name: badgeData.name,
							description: badgeData.description,
							imageUrl: badgeData.imageUrl,
							createdByName: 'Unknown',
							createdAt: badgeData.createdAt.toDate(),
						} as ProcessedBadge
					}
				})
			)

			setBadgesList(results)
			setIsProcessing(false)
		}

		processBadges()
	}, [badgesSnapshot])

	// Dialog state
	const [dialogMode, setDialogMode] = useState<DialogMode>('closed')
	const [selectedBadge, setSelectedBadge] = useState<ProcessedBadge | null>(
		null
	)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [badgeToDelete, setBadgeToDelete] = useState<ProcessedBadge | null>(
		null
	)

	// Form state
	const [formData, setFormData] = useState({
		name: '',
		description: '',
		imageFile: null as File | null,
		removeImage: false,
	})

	// Award badge form state
	const [teamBadges, setTeamBadges] = useState<Record<string, boolean>>({})
	const [loadingTeamBadges, setLoadingTeamBadges] = useState(false)

	// Loading states
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Reset form
	const resetForm = () => {
		setFormData({
			name: '',
			description: '',
			imageFile: null,
			removeImage: false,
		})
		setSelectedBadge(null)
		setDialogMode('closed')
	}

	// Open create dialog
	const handleCreate = () => {
		resetForm()
		setDialogMode('create')
	}

	// Open edit dialog
	const handleEdit = (badge: ProcessedBadge) => {
		setSelectedBadge(badge)
		setFormData({
			name: badge.name,
			description: badge.description,
			imageFile: null,
			removeImage: false,
		})
		setDialogMode('edit')
	}

	// Open award dialog
	const handleAward = (badge: ProcessedBadge) => {
		setSelectedBadge(badge)
		setDialogMode('award')
		// Load team badges for this badge
		loadTeamBadges(badge.id)
	}

	// Load which teams have this badge
	const loadTeamBadges = async (badgeId: string) => {
		if (!teams) return

		setLoadingTeamBadges(true)
		const badgesMap: Record<string, boolean> = {}

		await Promise.all(
			teams.map(async (team) => {
				try {
					const teamBadgeDoc = await getDoc(
						team.ref.collection('badges').doc(badgeId)
					)
					badgesMap[team.id] = teamBadgeDoc.exists()
				} catch (error) {
					console.error(`Error loading badge for team ${team.id}:`, error)
					badgesMap[team.id] = false
				}
			})
		)

		setTeamBadges(badgesMap)
		setLoadingTeamBadges(false)
	}

	// Handle file selection
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) {
			// Validate file type
			if (!file.type.startsWith('image/')) {
				toast.error('Please select an image file')
				return
			}

			// Validate file size (5MB max)
			const maxSize = 5 * 1024 * 1024
			if (file.size > maxSize) {
				toast.error('Image size must not exceed 5MB')
				return
			}

			setFormData((prev) => ({ ...prev, imageFile: file, removeImage: false }))
		}
	}

	// Convert file to base64
	const fileToBase64 = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => {
				const result = reader.result as string
				const base64 = result.split(',')[1] // Remove data:image/xxx;base64, prefix
				resolve(base64)
			}
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
	}

	// Submit form
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!formData.name.trim() || !formData.description.trim()) {
			toast.error('Please fill in all required fields')
			return
		}

		setIsSubmitting(true)

		try {
			if (dialogMode === 'create') {
				// Create badge
				let imageBlob: string | undefined
				let imageContentType: string | undefined

				if (formData.imageFile) {
					imageBlob = await fileToBase64(formData.imageFile)
					imageContentType = formData.imageFile.type
				}

				const result = await createBadgeViaFunction({
					name: formData.name,
					description: formData.description,
					imageBlob,
					imageContentType,
				})

				toast.success(result.message)
			} else if (dialogMode === 'edit' && selectedBadge) {
				// Update badge
				let imageBlob: string | undefined
				let imageContentType: string | undefined

				if (formData.imageFile) {
					imageBlob = await fileToBase64(formData.imageFile)
					imageContentType = formData.imageFile.type
				}

				// Prepare update payload
				const updatePayload = {
					badgeId: selectedBadge.id,
					name:
						formData.name.trim() !== selectedBadge.name
							? formData.name.trim()
							: undefined,
					description:
						formData.description.trim() !== selectedBadge.description
							? formData.description.trim()
							: undefined,
					imageBlob,
					imageContentType,
					removeImage: formData.removeImage,
				}

				console.log('Update payload:', updatePayload)

				const result = await updateBadgeViaFunction(updatePayload)

				toast.success(result.message)
			}

			resetForm()
		} catch (error) {
			console.error('Error saving badge:', error)
			console.error('Error details:', JSON.stringify(error, null, 2))

			// Extract Firebase Functions error message
			let errorMessage = 'Failed to save badge'
			if (error && typeof error === 'object') {
				// Check for Firebase Functions error structure
				if ('code' in error && 'message' in error) {
					// Firebase Functions error
					errorMessage = String(error.message)
					console.error('Firebase error code:', error.code)
				} else if ('message' in error && typeof error.message === 'string') {
					errorMessage = error.message
				} else if ('details' in error && typeof error.details === 'string') {
					errorMessage = error.details
				}
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			toast.error(errorMessage, {
				description:
					dialogMode === 'create'
						? 'Badge creation failed'
						: 'Badge update failed',
			})
		} finally {
			setIsSubmitting(false)
		}
	}

	// Handle delete
	const handleDeleteClick = (badge: ProcessedBadge) => {
		setBadgeToDelete(badge)
		setDeleteDialogOpen(true)
	}

	const confirmDelete = async () => {
		if (!badgeToDelete) return

		try {
			const result = await deleteBadgeViaFunction({
				badgeId: badgeToDelete.id,
			})
			toast.success(result.message)
			setDeleteDialogOpen(false)
			setBadgeToDelete(null)
		} catch (error) {
			console.error('Error deleting badge:', error)

			// Extract Firebase Functions error message
			let errorMessage = 'Failed to delete badge'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			toast.error(errorMessage, {
				description: 'Badge deletion failed',
			})
		}
	}

	// Handle award/revoke badge
	const handleAwardToggle = async (teamId: string) => {
		if (!selectedBadge) return

		const hasBadge = teamBadges[teamId]

		try {
			if (hasBadge) {
				// Revoke badge
				const result = await revokeBadgeViaFunction({
					badgeId: selectedBadge.id,
					teamId,
				})
				toast.success(result.message)
			} else {
				// Award badge
				const result = await awardBadgeViaFunction({
					badgeId: selectedBadge.id,
					teamId,
				})
				toast.success(result.message)
			}

			// Refresh team badges
			loadTeamBadges(selectedBadge.id)
		} catch (error) {
			console.error('Error toggling badge:', error)

			// Extract Firebase Functions error message
			let errorMessage = 'Failed to update badge award'
			if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = String(error.message)
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			toast.error(errorMessage, {
				description: hasBadge
					? 'Failed to revoke badge'
					: 'Failed to award badge',
			})
		}
	}

	// Loading state
	if (playerLoading || badgesLoading || isProcessing) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<LoadingSpinner size='lg' />
					</CardContent>
				</Card>
			</div>
		)
	}

	// Access denied
	if (!isAdmin) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<div className='flex items-center justify-center gap-2 text-red-600 mb-4'>
							<AlertTriangle className='h-6 w-6' />
							<h2 className='text-xl font-semibold'>Access Denied</h2>
						</div>
						<p className='text-muted-foreground'>
							You don't have permission to access badge management.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Badge Management'
				description='Create and manage badges that can be awarded to teams for special accomplishments'
				icon={Award}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between gap-4'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
				<Button onClick={handleCreate}>
					<Plus className='h-4 w-4 mr-2' />
					Create Badge
				</Button>
			</div>

			{/* Badges Table */}
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<CardTitle className='flex items-center gap-2'>
								<Trophy className='h-5 w-5' />
								Badges ({badgesList.length})
							</CardTitle>
							<CardDescription>
								View and manage all badges in the system
							</CardDescription>
						</div>
						<Select
							value={selectedSeasonId}
							onValueChange={(value) => setSelectedSeasonId(value)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Filter by season' />
							</SelectTrigger>
							<SelectContent>
								{seasons?.map((season) => (
									<SelectItem key={season.id} value={season.id}>
										{season.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent>
					{badgesList.length === 0 ? (
						<div className='text-center py-12'>
							<Award className='h-12 w-12 mx-auto text-muted-foreground mb-4' />
							<p className='text-muted-foreground'>
								No badges created yet. Create your first badge to get started.
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='w-[80px]'>Image</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Description</TableHead>
									<TableHead className='w-[150px]'>Created By</TableHead>
									<TableHead className='w-[120px]'>Created</TableHead>
									<TableHead className='w-[180px] text-right'>
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{badgesList.map((badge) => (
									<TableRow key={badge.id}>
										<TableCell>
											{badge.imageUrl ? (
												<img
													src={badge.imageUrl}
													alt={badge.name}
													className='w-12 h-12 object-cover rounded'
												/>
											) : (
												<div className='w-12 h-12 bg-muted rounded flex items-center justify-center'>
													<ImageIcon className='h-6 w-6 text-muted-foreground' />
												</div>
											)}
										</TableCell>
										<TableCell className='font-medium'>{badge.name}</TableCell>
										<TableCell className='max-w-md truncate'>
											{badge.description}
										</TableCell>
										<TableCell>{badge.createdByName}</TableCell>
										<TableCell className='text-muted-foreground text-sm'>
											{formatDistanceToNow(badge.createdAt, {
												addSuffix: true,
											})}
										</TableCell>
										<TableCell className='text-right'>
											<div className='flex items-center justify-end gap-2'>
												<Button
													variant='outline'
													size='sm'
													onClick={() => handleAward(badge)}
												>
													<Trophy className='h-4 w-4 mr-1' />
													Award
												</Button>
												<Button
													variant='outline'
													size='sm'
													onClick={() => handleEdit(badge)}
												>
													<Pencil className='h-4 w-4' />
												</Button>
												<Button
													variant='outline'
													size='sm'
													onClick={() => handleDeleteClick(badge)}
												>
													<Trash2 className='h-4 w-4' />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{/* Create/Edit Dialog */}
			<Dialog
				open={dialogMode === 'create' || dialogMode === 'edit'}
				onOpenChange={() => resetForm()}
			>
				<DialogContent className='max-w-2xl'>
					<DialogHeader>
						<DialogTitle>
							{dialogMode === 'create' ? 'Create New Badge' : 'Edit Badge'}
						</DialogTitle>
						<DialogDescription>
							{dialogMode === 'create'
								? 'Create a new badge that can be awarded to teams'
								: 'Update the badge details'}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit}>
						<div className='space-y-4 py-4'>
							<div className='space-y-2'>
								<Label htmlFor='name'>
									Badge Name <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='name'
									value={formData.name}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, name: e.target.value }))
									}
									placeholder='Enter badge name'
									required
								/>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='description'>
									Description <span className='text-red-500'>*</span>
								</Label>
								<Textarea
									id='description'
									value={formData.description}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											description: e.target.value,
										}))
									}
									placeholder='Enter badge description'
									rows={3}
									required
								/>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='image'>Badge Image</Label>
								{selectedBadge?.imageUrl &&
									!formData.imageFile &&
									!formData.removeImage && (
										<div className='mb-2'>
											<img
												src={selectedBadge.imageUrl}
												alt={selectedBadge.name}
												className='w-24 h-24 object-cover rounded'
											/>
										</div>
									)}
								<Input
									id='image'
									type='file'
									accept='image/*'
									onChange={handleFileChange}
								/>
								<p className='text-sm text-muted-foreground'>
									PNG, JPG, GIF, WEBP, or SVG. Max 5MB.
								</p>
								{dialogMode === 'edit' &&
									selectedBadge?.imageUrl &&
									!formData.removeImage && (
										<Button
											type='button'
											variant='outline'
											size='sm'
											onClick={() =>
												setFormData((prev) => ({ ...prev, removeImage: true }))
											}
										>
											<X className='h-4 w-4 mr-2' />
											Remove Current Image
										</Button>
									)}
								{formData.removeImage && (
									<Badge variant='destructive'>Image will be removed</Badge>
								)}
							</div>
						</div>

						<DialogFooter>
							<Button type='button' variant='outline' onClick={resetForm}>
								Cancel
							</Button>
							<Button type='submit' disabled={isSubmitting}>
								{isSubmitting && (
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								)}
								{dialogMode === 'create' ? 'Create Badge' : 'Save Changes'}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Award Badge Dialog */}
			<Dialog open={dialogMode === 'award'} onOpenChange={() => resetForm()}>
				<DialogContent className='max-w-2xl'>
					<DialogHeader>
						<DialogTitle>Award Badge: {selectedBadge?.name}</DialogTitle>
						<DialogDescription>
							Select teams to award or revoke this badge
						</DialogDescription>
					</DialogHeader>

					<div className='py-4'>
						{loadingTeamBadges || teamsLoading ? (
							<div className='flex items-center justify-center py-8'>
								<LoadingSpinner />
							</div>
						) : teams && teams.length > 0 ? (
							<div className='space-y-2 max-h-[400px] overflow-y-auto'>
								{teams.map((team) => {
									const hasBadge = teamBadges[team.id]
									return (
										<div
											key={team.id}
											className='flex items-center justify-between p-3 border rounded-lg'
										>
											<div className='flex items-center gap-3'>
												{team.logo && (
													<img
														src={team.logo}
														alt={team.name}
														className='w-10 h-10 object-cover rounded'
													/>
												)}
												<div>
													<p className='font-medium'>{team.name}</p>
													{hasBadge && (
														<Badge variant='secondary' className='mt-1'>
															Has Badge
														</Badge>
													)}
												</div>
											</div>
											<Button
												variant={hasBadge ? 'destructive' : 'default'}
												size='sm'
												onClick={() => handleAwardToggle(team.id)}
											>
												{hasBadge ? (
													<>
														<X className='h-4 w-4 mr-1' />
														Revoke
													</>
												) : (
													<>
														<Trophy className='h-4 w-4 mr-1' />
														Award
													</>
												)}
											</Button>
										</div>
									)
								})}
							</div>
						) : (
							<div className='text-center py-8'>
								<p className='text-muted-foreground'>
									No teams found in the current season
								</p>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button variant='outline' onClick={resetForm}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				onConfirm={confirmDelete}
				title='Delete Badge'
				description={`Are you sure you want to delete "${badgeToDelete?.name}"? This will also remove it from all teams that have been awarded this badge. This action cannot be undone.`}
			>
				<></>
			</DestructiveConfirmationDialog>
		</PageContainer>
	)
}
