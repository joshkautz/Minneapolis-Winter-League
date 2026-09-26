/**
 * News Management admin component
 *
 * Allows admins to create, edit, and delete news posts
 */

import { useState } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import {
	Newspaper,
	Plus,
	Pencil,
	Trash2,
	Calendar,
	User,
	Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { allNewsQueryBySeason } from '@/firebase/collections/news'
import {
	createNewsViaFunction,
	updateNewsViaFunction,
	deleteNewsViaFunction,
} from '@/firebase/collections/functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
	PageContainer,
	PageHeader,
	DestructiveConfirmationDialog,
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
import { NewsDocument, PlayerDocument, SeasonDocument } from '@/types'
import {
	logger,
	errorMessage,
	formatShortDate,
	formatClockTime,
	formatRelativeTime,
} from '@/shared/utils'
import { useQueryErrorHandler, useResolvedSnapshot } from '@/shared/hooks'
import {
	BackToAdminButton,
	SeasonFilterCard,
	useAdminSeasonFilter,
} from '@/features/admin/shared'

interface ProcessedNews {
	id: string
	title: string
	content: string
	authorName: string
	seasonName: string
	seasonId: string
	createdAt: Date
	updatedAt: Date
}

type DialogMode = 'create' | 'edit' | 'closed'

export const NewsManagement = () => {
	const navigate = useNavigate()

	const {
		currentSeasonId,
		seasons,
		seasonsError,
		selectedSeasonId,
		setSelectedSeasonId,
		selectedSeasonSnapshot,
	} = useAdminSeasonFilter()
	const selectedSeasonRef = selectedSeasonSnapshot?.ref ?? null

	const [newsSnapshot, newsLoading, newsError] = useCollection(
		selectedSeasonRef ? allNewsQueryBySeason(selectedSeasonRef) : null
	)

	useQueryErrorHandler({
		error: seasonsError,
		component: 'NewsManagement',
		errorLabel: 'seasons',
	})
	useQueryErrorHandler({
		error: newsError,
		component: 'NewsManagement',
		errorLabel: 'news',
	})

	// Process news to resolve references

	// useResolvedSnapshot derives the loading flag from which snapshot the
	// rows belong to, so there is no synchronous setState in an effect, and a
	// slow resolve for a superseded snapshot cannot overwrite newer rows.
	const { items: newsList, isProcessing } = useResolvedSnapshot(
		newsSnapshot,
		async (snapshot) => {
			const results = await Promise.all(
				snapshot.docs.map(async (newsDoc) => {
					const newsData = newsDoc.data() as NewsDocument
					const newsId = newsDoc.id

					try {
						// Fetch author data
						const authorDoc = await getDoc(newsData.author)
						const authorData = authorDoc.data() as PlayerDocument | undefined
						const authorName = authorData
							? `${authorData.firstname} ${authorData.lastname}`
							: 'Unknown Author'

						// Fetch season data
						const seasonDoc = await getDoc(newsData.season)
						const seasonData = seasonDoc.data() as SeasonDocument | undefined
						const seasonName = seasonData?.name || 'Unknown Season'

						return {
							id: newsId,
							title: newsData.title,
							content: newsData.content,
							authorName,
							seasonName,
							seasonId: newsData.season.id,
							createdAt: newsData.createdAt.toDate(),
							updatedAt: newsData.updatedAt.toDate(),
						} as ProcessedNews
					} catch (error) {
						logger.error(
							'Error processing news post',
							error instanceof Error ? error : undefined,
							{ component: 'NewsManagement', action: 'processNews', newsId }
						)
						return null
					}
				})
			)

			const validNews = results.filter((n): n is ProcessedNews => n !== null)
			return validNews
		}
	)

	// Dialog state
	const [dialogMode, setDialogMode] = useState<DialogMode>('closed')
	const [editingNewsId, setEditingNewsId] = useState<string | null>(null)
	const [formTitle, setFormTitle] = useState('')
	const [formContent, setFormContent] = useState('')
	const [formSeasonId, setFormSeasonId] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Delete confirmation dialog state
	const [deletingNewsId, setDeletingNewsId] = useState<string | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Character count
	const titleCharCount = formTitle.length
	const contentCharCount = formContent.length

	// Open create dialog
	const handleOpenCreate = () => {
		setDialogMode('create')
		setFormTitle('')
		setFormContent('')
		setFormSeasonId(currentSeasonId ?? '')
		setEditingNewsId(null)
	}

	// Open edit dialog
	const handleOpenEdit = (news: ProcessedNews) => {
		setDialogMode('edit')
		setFormTitle(news.title)
		setFormContent(news.content)
		setFormSeasonId(news.seasonId)
		setEditingNewsId(news.id)
	}

	// Close dialog
	const handleCloseDialog = () => {
		setDialogMode('closed')
		setFormTitle('')
		setFormContent('')
		setFormSeasonId('')
		setEditingNewsId(null)
	}

	// Handle create/edit submit
	const handleSubmit = async () => {
		// Validation
		if (formTitle.trim().length < 3) {
			toast.error('Title must be at least 3 characters long')
			return
		}

		if (formTitle.length > 200) {
			toast.error('Title must not exceed 200 characters')
			return
		}

		if (formContent.trim().length < 10) {
			toast.error('Content must be at least 10 characters long')
			return
		}

		if (formContent.length > 10000) {
			toast.error('Content must not exceed 10,000 characters')
			return
		}

		if (!formSeasonId) {
			toast.error('Please select a season')
			return
		}

		setIsSubmitting(true)

		try {
			if (dialogMode === 'create') {
				const result = await createNewsViaFunction({
					title: formTitle,
					content: formContent,
					seasonId: formSeasonId,
				})
				toast.success(result.message)
			} else if (dialogMode === 'edit' && editingNewsId) {
				const result = await updateNewsViaFunction({
					newsId: editingNewsId,
					title: formTitle,
					content: formContent,
					seasonId: formSeasonId,
				})
				toast.success(result.message)
			}

			handleCloseDialog()
		} catch (error) {
			logger.error(
				'Error saving news post',
				error instanceof Error ? error : undefined,
				{ component: 'NewsManagement', action: 'saveNews' }
			)
			toast.error(
				errorMessage(
					error,
					'The news post could not be saved. Please try again.'
				)
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	// Handle delete
	const handleDelete = async () => {
		if (!deletingNewsId) return

		setIsDeleting(true)

		try {
			const result = await deleteNewsViaFunction({ newsId: deletingNewsId })
			toast.success(result.message)
			setDeletingNewsId(null)
		} catch (error) {
			logger.error(
				'Error deleting news post',
				error instanceof Error ? error : undefined,
				{ component: 'NewsManagement', action: 'deleteNews' }
			)
			toast.error(
				errorMessage(
					error,
					'The news post could not be deleted. Please try again.'
				)
			)
		} finally {
			setIsDeleting(false)
		}
	}

	// Handle query errors
	if (seasonsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={seasonsError}
					title='Error Loading Seasons'
					onRetry={() => navigate(0)}
				/>
			</div>
		)
	}

	if (newsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={newsError}
					title='Error Loading News'
					onRetry={() => navigate(0)}
				/>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='News Management'
				description='Create, edit, and manage news posts for league announcements'
				icon={Newspaper}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between gap-4'>
				<BackToAdminButton />
				<Button onClick={handleOpenCreate}>
					<Plus className='h-4 w-4 mr-2' />
					Create News Post
				</Button>
			</div>

			<SeasonFilterCard
				seasons={seasons}
				selectedSeasonId={selectedSeasonId}
				onSeasonChange={setSelectedSeasonId}
			/>

			{/* News Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Newspaper className='h-5 w-5 text-blue-600' />
						News Posts ({newsList.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{newsLoading || isProcessing ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading news posts...</p>
						</div>
					) : !selectedSeasonId ? (
						<div className='text-center py-12'>
							<p className='text-muted-foreground'>
								Please select a season to view news posts
							</p>
						</div>
					) : newsList.length === 0 ? (
						<div className='text-center py-12'>
							<Newspaper className='h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50' />
							<p className='text-lg font-medium text-muted-foreground'>
								No News Posts
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								Create your first news post to get started
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Author</TableHead>
										<TableHead>Season</TableHead>
										<TableHead>Created</TableHead>
										<TableHead>Updated</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{newsList.map((news) => (
										<TableRow key={news.id}>
											<TableCell>
												<div className='font-medium max-w-md truncate'>
													{news.title}
												</div>
												<div className='text-sm text-muted-foreground mt-1 max-w-md truncate'>
													{news.content}
												</div>
											</TableCell>
											<TableCell>
												<div className='flex items-center gap-1.5 text-sm'>
													<User className='h-3 w-3 text-muted-foreground' />
													{news.authorName}
												</div>
											</TableCell>
											<TableCell>
												<div className='text-sm'>{news.seasonName}</div>
											</TableCell>
											<TableCell>
												<div className='text-sm'>
													<div className='flex items-center gap-1'>
														<Calendar className='h-3 w-3 text-muted-foreground' />
														{formatShortDate(news.createdAt)}
													</div>
													<div className='text-xs text-muted-foreground'>
														{formatClockTime(news.createdAt)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<div className='text-sm text-muted-foreground'>
													{news.updatedAt.getTime() !== news.createdAt.getTime()
														? formatRelativeTime(news.updatedAt)
														: '—'}
												</div>
											</TableCell>
											<TableCell>
												<div className='flex items-center justify-end gap-2'>
													<Button
														size='sm'
														variant='outline'
														className='h-8 gap-1'
														onClick={() => handleOpenEdit(news)}
													>
														<Pencil className='h-3 w-3' />
														Edit
													</Button>
													<Button
														size='sm'
														variant='destructive'
														className='h-8 gap-1'
														onClick={() => setDeletingNewsId(news.id)}
													>
														<Trash2 className='h-3 w-3' />
														Delete
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Create/Edit Dialog */}
			<Dialog
				open={dialogMode !== 'closed'}
				onOpenChange={(open) => !open && handleCloseDialog()}
			>
				<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>
							{dialogMode === 'create' ? 'Create News Post' : 'Edit News Post'}
						</DialogTitle>
						<DialogDescription>
							{dialogMode === 'create'
								? 'Create a new news post to share updates with league participants'
								: 'Update the news post information'}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						{/* Season Selector */}
						<div className='space-y-2'>
							<Label htmlFor='season'>
								Season <span className='text-destructive'>*</span>
							</Label>
							<Select value={formSeasonId} onValueChange={setFormSeasonId}>
								<SelectTrigger id='season'>
									<SelectValue placeholder='Select season' />
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

						{/* Title */}
						<div className='space-y-2'>
							<Label htmlFor='title'>
								Title <span className='text-destructive'>*</span>
							</Label>
							<Input
								id='title'
								placeholder='Enter news post title'
								value={formTitle}
								onChange={(e) => setFormTitle(e.target.value)}
								maxLength={200}
								aria-describedby='title-description'
							/>
							<p
								id='title-description'
								className='text-xs text-muted-foreground flex justify-between'
							>
								<span>3-200 characters</span>
								<span
									className={titleCharCount > 200 ? 'text-destructive' : ''}
								>
									{titleCharCount}/200
								</span>
							</p>
						</div>

						{/* Content */}
						<div className='space-y-2'>
							<Label htmlFor='content'>
								Content <span className='text-destructive'>*</span>
							</Label>
							<Textarea
								id='content'
								placeholder='Enter news post content'
								value={formContent}
								onChange={(e) => setFormContent(e.target.value)}
								rows={10}
								maxLength={10000}
								className='resize-none font-mono text-sm'
								aria-describedby='content-description'
							/>
							<p
								id='content-description'
								className='text-xs text-muted-foreground flex justify-between'
							>
								<span>10-10,000 characters (line breaks preserved)</span>
								<span
									className={contentCharCount > 10000 ? 'text-destructive' : ''}
								>
									{contentCharCount}/10,000
								</span>
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={handleCloseDialog}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									{dialogMode === 'create' ? 'Creating...' : 'Updating...'}
								</>
							) : (
								<>{dialogMode === 'create' ? 'Create Post' : 'Update Post'}</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deletingNewsId !== null}
				onOpenChange={(open) => !open && setDeletingNewsId(null)}
				onConfirm={handleDelete}
				title='Delete News Post'
				description='Are you sure you want to delete this news post? This action cannot be undone and the post will be permanently removed from the system.'
				continueText={isDeleting ? 'Deleting...' : 'Delete Post'}
			>
				{/* This component requires children even when controlled externally */}
				<div />
			</DestructiveConfirmationDialog>
		</PageContainer>
	)
}
