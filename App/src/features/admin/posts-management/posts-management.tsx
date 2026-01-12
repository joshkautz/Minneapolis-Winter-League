/**
 * Posts Management admin component
 *
 * Allows admins to moderate posts and replies
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useDocument, useCollection } from 'react-firebase-hooks/firestore'
import { getDoc } from 'firebase/firestore'
import {
	ArrowLeft,
	AlertTriangle,
	Users,
	Trash2,
	Calendar,
	User,
	Loader2,
	ChevronDown,
	ChevronUp,
	MessageSquare,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { auth } from '@/firebase/auth'
import { getPlayerRef } from '@/firebase/collections/players'
import {
	allPostsQueryBySeason,
	repliesQuery,
} from '@/firebase/collections/posts'
import { useSeasonsContext } from '@/providers'
import {
	deletePostViaFunction,
	deleteReplyViaFunction,
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
	PostDocument,
	ReplyDocument,
	PlayerDocument,
	SeasonDocument,
} from '@/types'
import { logger } from '@/shared/utils'
import { useQueryErrorHandler } from '@/shared/hooks'

interface ProcessedPost {
	id: string
	content: string
	authorName: string
	authorId: string
	replyCount: number
	createdAt: Date
	updatedAt: Date
}

interface ProcessedReply {
	id: string
	content: string
	authorName: string
	authorId: string
	createdAt: Date
	updatedAt: Date
}

export const PostsManagement = () => {
	const navigate = useNavigate()
	const [user] = useAuthState(auth)
	const playerRef = getPlayerRef(user)
	const [playerSnapshot, playerLoading, playerError] = useDocument(playerRef)

	const isAdmin = playerSnapshot?.data()?.admin || false

	// Get all seasons from context
	const {
		seasonsQuerySnapshot: seasonsSnapshot,
		seasonsQuerySnapshotError: seasonsError,
	} = useSeasonsContext()
	const seasons = seasonsSnapshot?.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as (SeasonDocument & { id: string })[] | undefined

	// Get current season (most recent)
	const currentSeason = useMemo(() => {
		if (!seasons || seasons.length === 0) return null
		return seasons[0] // Seasons are sorted by dateStart desc
	}, [seasons])

	// Selected season for filtering posts
	const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')

	// Set default selected season when current season is loaded
	useEffect(() => {
		if (currentSeason && !selectedSeasonId) {
			setSelectedSeasonId(currentSeason.id)
		}
	}, [currentSeason, selectedSeasonId])

	// Fetch posts for selected season
	const selectedSeasonRef = useMemo(() => {
		if (!selectedSeasonId || !seasonsSnapshot) return null
		const seasonDoc = seasonsSnapshot.docs.find(
			(doc) => doc.id === selectedSeasonId
		)
		return seasonDoc?.ref || null
	}, [selectedSeasonId, seasonsSnapshot])

	const [postsSnapshot, postsLoading, postsError] = useCollection(
		selectedSeasonRef ? allPostsQueryBySeason(selectedSeasonRef) : null
	)

	// Log and notify on query errors
	useQueryErrorHandler({
		error: playerError,
		component: 'PostsManagement',
		errorLabel: 'player',
	})
	useQueryErrorHandler({
		error: seasonsError,
		component: 'PostsManagement',
		errorLabel: 'seasons',
	})
	useQueryErrorHandler({
		error: postsError,
		component: 'PostsManagement',
		errorLabel: 'posts',
	})

	// Process posts to resolve references
	const [postsList, setPostsList] = useState<ProcessedPost[]>([])
	const [isProcessing, setIsProcessing] = useState(false)

	useEffect(() => {
		if (!postsSnapshot) {
			setPostsList([])
			setIsProcessing(false)
			return
		}

		setIsProcessing(true)

		const processPosts = async () => {
			const results = await Promise.all(
				postsSnapshot.docs.map(async (postDoc) => {
					const postData = postDoc.data() as PostDocument
					const postId = postDoc.id

					try {
						// Fetch author data
						const authorDoc = await getDoc(postData.author)
						const authorData = authorDoc.data() as PlayerDocument | undefined
						const authorName = authorData
							? `${authorData.firstname} ${authorData.lastname}`
							: 'Unknown Author'

						return {
							id: postId,
							content: postData.content,
							authorName,
							authorId: postData.author.id,
							replyCount: postData.replyCount,
							createdAt: postData.createdAt.toDate(),
							updatedAt: postData.updatedAt.toDate(),
						} as ProcessedPost
					} catch (error) {
						logger.error(
							'Error processing post',
							error instanceof Error ? error : undefined,
							{ component: 'PostsManagement', action: 'processPosts', postId }
						)
						return null
					}
				})
			)

			const validPosts = results.filter((p): p is ProcessedPost => p !== null)
			setPostsList(validPosts)
			setIsProcessing(false)
		}

		processPosts()
	}, [postsSnapshot])

	// Delete confirmation dialog state
	const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
	const [deletingReply, setDeletingReply] = useState<{
		postId: string
		replyId: string
	} | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Expanded rows for viewing replies
	const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set())

	const toggleExpanded = (postId: string) => {
		setExpandedPostIds((prev) => {
			const next = new Set(prev)
			if (next.has(postId)) {
				next.delete(postId)
			} else {
				next.add(postId)
			}
			return next
		})
	}

	// Handle delete post
	const handleDeletePost = async () => {
		if (!deletingPostId) return

		setIsDeleting(true)

		try {
			const result = await deletePostViaFunction({ postId: deletingPostId })
			toast.success(result.message)
			setDeletingPostId(null)
		} catch (error) {
			logger.error(
				'Error deleting post',
				error instanceof Error ? error : undefined,
				{ component: 'PostsManagement', action: 'deletePost' }
			)
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete post'
			)
		} finally {
			setIsDeleting(false)
		}
	}

	// Handle delete reply
	const handleDeleteReply = async () => {
		if (!deletingReply) return

		setIsDeleting(true)

		try {
			const result = await deleteReplyViaFunction({
				postId: deletingReply.postId,
				replyId: deletingReply.replyId,
			})
			toast.success(result.message)
			setDeletingReply(null)
		} catch (error) {
			logger.error(
				'Error deleting reply',
				error instanceof Error ? error : undefined,
				{ component: 'PostsManagement', action: 'deleteReply' }
			)
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete reply'
			)
		} finally {
			setIsDeleting(false)
		}
	}

	const formatDate = (date: Date) => {
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})
	}

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	const formatRelativeTime = (date: Date) => {
		try {
			return formatDistanceToNow(date, { addSuffix: true })
		} catch {
			return 'Recently'
		}
	}

	// Handle authentication and data loading
	if (playerLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<Card>
					<CardContent className='p-6 text-center'>
						<p>Loading...</p>
					</CardContent>
				</Card>
			</div>
		)
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

	if (postsError) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<QueryError
					error={postsError}
					title='Error Loading Posts'
					onRetry={() => navigate(0)}
				/>
			</div>
		)
	}

	// Handle non-admin users
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
							You don't have permission to access the admin dashboard.
						</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<PageContainer withSpacing withGap>
			<PageHeader
				title='Posts Management'
				description='Moderate message board posts and replies'
				icon={Users}
			/>

			{/* Back to Dashboard */}
			<div className='flex items-center justify-between gap-4'>
				<Button variant='outline' asChild>
					<Link to='/admin'>
						<ArrowLeft className='h-4 w-4 mr-2' />
						Back to Admin Dashboard
					</Link>
				</Button>
			</div>

			{/* Season Selector */}
			<Card>
				<CardHeader>
					<CardTitle className='text-lg'>Filter by Season</CardTitle>
				</CardHeader>
				<CardContent>
					<Select
						value={selectedSeasonId}
						onValueChange={setSelectedSeasonId}
						disabled={!seasons || seasons.length === 0}
					>
						<SelectTrigger className='w-full max-w-md'>
							<SelectValue placeholder='Select a season' />
						</SelectTrigger>
						<SelectContent>
							{seasons?.map((season) => (
								<SelectItem key={season.id} value={season.id}>
									{season.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			{/* Posts Table */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Users className='h-5 w-5 text-blue-600' />
						Posts ({postsList.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{postsLoading || isProcessing ? (
						<div className='text-center py-12'>
							<Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
							<p className='text-muted-foreground'>Loading posts...</p>
						</div>
					) : !selectedSeasonId ? (
						<div className='text-center py-12'>
							<p className='text-muted-foreground'>
								Please select a season to view posts
							</p>
						</div>
					) : postsList.length === 0 ? (
						<div className='text-center py-12'>
							<Users className='h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50' />
							<p className='text-lg font-medium text-muted-foreground'>
								No Posts
							</p>
							<p className='text-sm text-muted-foreground mt-2'>
								No posts have been created for this season yet
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-8' />
										<TableHead>Author</TableHead>
										<TableHead>Content</TableHead>
										<TableHead>Replies</TableHead>
										<TableHead>Created</TableHead>
										<TableHead>Updated</TableHead>
										<TableHead className='text-right'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{postsList.map((post) => (
										<Collapsible
											key={post.id}
											open={expandedPostIds.has(post.id)}
											onOpenChange={() => toggleExpanded(post.id)}
											asChild
										>
											<>
												<TableRow>
													<TableCell>
														{post.replyCount > 0 && (
															<CollapsibleTrigger asChild>
																<Button
																	variant='ghost'
																	size='sm'
																	className='h-6 w-6 p-0'
																>
																	{expandedPostIds.has(post.id) ? (
																		<ChevronUp className='h-4 w-4' />
																	) : (
																		<ChevronDown className='h-4 w-4' />
																	)}
																</Button>
															</CollapsibleTrigger>
														)}
													</TableCell>
													<TableCell>
														<Link
															to={`/players/${post.authorId}`}
															className='flex items-center gap-1.5 text-sm hover:underline'
														>
															<User className='h-3 w-3 text-muted-foreground' />
															{post.authorName}
														</Link>
													</TableCell>
													<TableCell>
														<div className='max-w-md truncate text-sm'>
															{post.content}
														</div>
													</TableCell>
													<TableCell>
														<div className='flex items-center gap-1 text-sm'>
															<MessageSquare className='h-3 w-3 text-muted-foreground' />
															{post.replyCount}
														</div>
													</TableCell>
													<TableCell>
														<div className='text-sm'>
															<div className='flex items-center gap-1'>
																<Calendar className='h-3 w-3 text-muted-foreground' />
																{formatDate(post.createdAt)}
															</div>
															<div className='text-xs text-muted-foreground'>
																{formatTime(post.createdAt)}
															</div>
														</div>
													</TableCell>
													<TableCell>
														<div className='text-sm text-muted-foreground'>
															{post.updatedAt.getTime() !==
															post.createdAt.getTime()
																? formatRelativeTime(post.updatedAt)
																: '—'}
														</div>
													</TableCell>
													<TableCell>
														<div className='flex items-center justify-end'>
															<Button
																size='sm'
																variant='destructive'
																className='h-8 gap-1'
																onClick={() => setDeletingPostId(post.id)}
															>
																<Trash2 className='h-3 w-3' />
																Delete
															</Button>
														</div>
													</TableCell>
												</TableRow>
												{post.replyCount > 0 && (
													<CollapsibleContent asChild>
														<RepliesRow
															postId={post.id}
															onDeleteReply={(replyId) =>
																setDeletingReply({
																	postId: post.id,
																	replyId,
																})
															}
														/>
													</CollapsibleContent>
												)}
											</>
										</Collapsible>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Delete Post Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deletingPostId !== null}
				onOpenChange={(open) => !open && setDeletingPostId(null)}
				onConfirm={handleDeletePost}
				title='Delete Post'
				description='Are you sure you want to delete this post? This will also delete all replies. This action cannot be undone.'
				continueText={isDeleting ? 'Deleting...' : 'Delete Post'}
			>
				<div />
			</DestructiveConfirmationDialog>

			{/* Delete Reply Confirmation Dialog */}
			<DestructiveConfirmationDialog
				open={deletingReply !== null}
				onOpenChange={(open) => !open && setDeletingReply(null)}
				onConfirm={handleDeleteReply}
				title='Delete Reply'
				description='Are you sure you want to delete this reply? This action cannot be undone.'
				continueText={isDeleting ? 'Deleting...' : 'Delete Reply'}
			>
				<div />
			</DestructiveConfirmationDialog>
		</PageContainer>
	)
}

/**
 * Component for displaying replies in an expanded row
 */
interface RepliesRowProps {
	postId: string
	onDeleteReply: (replyId: string) => void
}

const RepliesRow = ({ postId, onDeleteReply }: RepliesRowProps) => {
	const [repliesSnapshot, repliesLoading] = useCollection(repliesQuery(postId))
	const [replies, setReplies] = useState<ProcessedReply[]>([])
	// Track which snapshot version we've processed to show loading state
	const [processedSnapshotId, setProcessedSnapshotId] = useState<string | null>(
		null
	)

	// Derive current snapshot ID for comparison
	const currentSnapshotId = repliesSnapshot
		? repliesSnapshot.docs.map((d) => d.id).join(',')
		: null

	// Show processing state when we have a new snapshot that hasn't been processed yet
	const isProcessing =
		currentSnapshotId !== null && currentSnapshotId !== processedSnapshotId

	useEffect(() => {
		// Skip processing if no snapshot available yet
		if (!repliesSnapshot) {
			return
		}

		let isCancelled = false
		const snapshotId = repliesSnapshot.docs.map((d) => d.id).join(',')

		const processReplies = async () => {
			const results = await Promise.all(
				repliesSnapshot.docs.map(async (replyDoc) => {
					const replyData = replyDoc.data() as ReplyDocument
					const replyId = replyDoc.id

					try {
						const authorDoc = await getDoc(replyData.author)
						const authorData = authorDoc.data() as PlayerDocument | undefined
						const authorName = authorData
							? `${authorData.firstname} ${authorData.lastname}`
							: 'Unknown Author'

						return {
							id: replyId,
							content: replyData.content,
							authorName,
							authorId: replyData.author.id,
							createdAt: replyData.createdAt.toDate(),
							updatedAt: replyData.updatedAt.toDate(),
						} as ProcessedReply
					} catch {
						return null
					}
				})
			)

			if (!isCancelled) {
				const validReplies = results.filter(
					(r): r is ProcessedReply => r !== null
				)
				setReplies(validReplies)
				setProcessedSnapshotId(snapshotId)
			}
		}

		processReplies()

		return () => {
			isCancelled = true
		}
	}, [repliesSnapshot])

	const formatRelativeTime = (date: Date) => {
		try {
			return formatDistanceToNow(date, { addSuffix: true })
		} catch {
			return 'Recently'
		}
	}

	if (repliesLoading || isProcessing) {
		return (
			<tr>
				<td colSpan={7} className='bg-muted/30'>
					<div className='flex items-center justify-center py-4'>
						<Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
						<span className='ml-2 text-sm text-muted-foreground'>
							Loading replies...
						</span>
					</div>
				</td>
			</tr>
		)
	}

	return (
		<>
			{replies.map((reply) => (
				<tr key={reply.id} className='bg-muted/30'>
					<td />
					<td className='py-2'>
						<Link
							to={`/players/${reply.authorId}`}
							className='flex items-center gap-1.5 text-sm hover:underline pl-4'
						>
							<User className='h-3 w-3 text-muted-foreground' />
							{reply.authorName}
						</Link>
					</td>
					<td className='py-2'>
						<div className='max-w-md truncate text-sm text-muted-foreground pl-4'>
							{reply.content}
						</div>
					</td>
					<td />
					<td className='py-2'>
						<div className='text-xs text-muted-foreground'>
							{formatRelativeTime(reply.createdAt)}
						</div>
					</td>
					<td className='py-2'>
						<div className='text-xs text-muted-foreground'>
							{reply.updatedAt.getTime() !== reply.createdAt.getTime()
								? 'Edited'
								: '—'}
						</div>
					</td>
					<td className='py-2'>
						<div className='flex items-center justify-end'>
							<Button
								size='sm'
								variant='ghost'
								className='h-7 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10'
								onClick={() => onDeleteReply(reply.id)}
							>
								<Trash2 className='h-3 w-3' />
								Delete
							</Button>
						</div>
					</td>
				</tr>
			))}
		</>
	)
}
