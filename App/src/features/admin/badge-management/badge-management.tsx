/**
 * Badge Management admin component
 *
 * Allows admins to create, edit, and delete badges
 */

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument } from 'react-firebase-hooks/firestore'
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
import { useSeasonsContext, useBadgesContext } from '@/providers'
import {
	createBadgeViaFunction,
	updateBadgeViaFunction,
	deleteBadgeViaFunction,
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
	QueryError,
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
import { BadgeDocument, PlayerDocument, SeasonDocument } from '@/types'
import { logger } from '@/shared/utils'
import { Badge } from '@/components/ui/badge'

interface ProcessedBadge {
	id: string
	name: string
	description: string
	imageUrl: string | null
	createdByName: string
	createdAt: Date
}

type DialogMode = 'create' | 'edit' | 'closed'

export const BadgeManagement = () => {
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotError: seasonsError,
		currentSeasonQueryDocumentSnapshot,
	} = useSeasonsContext()
	const {
		allBadgesQuerySnapshot: badgesSnapshot,
		allBadgesQuerySnapshotLoading: badgesLoading,
		allBadgesQuerySnapshotError: badgesError,
	} = useBadgesContext()

	const isAdmin = playerSnapshot?.data()?.admin || false
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

	// Log and notify on query errors
	useEffect(() => {
		if (playerError) {
			logger.error('Failed to load player:', {
				component: 'BadgeManagement',
				error: playerError.message,
			})
			toast.error('Failed to load player', {
				description: playerError.message,
			})
		}
	}, [playerError])

	useEffect(() => {
		if (seasonsError) {
			logger.error('Failed to load seasons:', {
				component: 'BadgeManagement',
				error: seasonsError.message,
			})
			toast.error('Failed to load seasons', {
				description: seasonsError.message,
			})
		}
	}, [seasonsError])

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
						logger.error(`Error processing badge ${badgeId}:`, error as Error)
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

	// Image preview state
	const [imagePreview, setImagePreview] = useState<File | null>(null)

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
		setImagePreview(null)
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
			setImagePreview(file)
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

				const result = await updateBadgeViaFunction(updatePayload)

				toast.success(result.message)
			}

			resetForm()
		} catch (error) {
			logger.error('Error saving badge:', error as Error)

			// Extract Firebase Functions error message
			let errorMessage = 'Failed to save badge'
			if (error && typeof error === 'object') {
				// Check for Firebase Functions error structure
				if ('code' in error && 'message' in error) {
					// Firebase Functions error
					errorMessage = String(error.message)
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
			logger.error('Error deleting badge:', error as Error)

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

	// Error state
	if (badgesError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={badgesError}
					title='Error Loading Badges'
					onRetry={() => window.location.reload()}
				/>
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
							<AlertTriangle className='h-6 w-6' aria-hidden='true' />
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
									Badge Description <span className='text-red-500'>*</span>
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
								<Label htmlFor='image'>Badge Logo (Optional)</Label>

								<Input
									id='image'
									type='file'
									accept='image/*'
									onChange={handleFileChange}
								/>

								{/* Image Preview */}
								{imagePreview ? (
									<div className='group flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-hidden'>
										<img
											src={URL.createObjectURL(imagePreview)}
											alt='Badge image preview'
											className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
										/>
									</div>
								) : selectedBadge?.imageUrl && !formData.removeImage ? (
									<div className='group flex items-center justify-center w-40 h-40 mx-auto rounded-md overflow-hidden'>
										<img
											src={selectedBadge.imageUrl}
											alt={selectedBadge.name}
											className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
										/>
									</div>
								) : (
									<div className='flex items-center justify-center w-40 h-40 mx-auto rounded-md bg-muted'>
										<span className='text-sm text-muted-foreground'>
											No image
										</span>
									</div>
								)}
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
							<Button type='submit' disabled={isSubmitting} className='w-full'>
								{isSubmitting && (
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								)}
								{dialogMode === 'create' ? 'Create Badge' : 'Save Changes'}
							</Button>
						</DialogFooter>
					</form>
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
