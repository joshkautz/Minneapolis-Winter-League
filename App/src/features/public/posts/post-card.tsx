import { useEffect, useState, useCallback } from 'react'
import { getDoc } from 'firebase/firestore'
import { useCollection } from 'react-firebase-hooks/firestore'
import { formatDistanceToNow } from 'date-fns'
import {
	User,
	Calendar,
	MessageSquare,
	ChevronDown,
	ChevronUp,
	Pencil,
	Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PostDocument, ReplyDocument, PlayerDocument } from '@/types'
import { repliesQuery } from '@/firebase/collections/posts'
import {
	updatePostViaFunction,
	createReplyViaFunction,
	updateReplyViaFunction,
} from '@/firebase/collections/functions'
import { logger } from '@/shared/utils'

interface PostCardProps {
	post: PostDocument
	postId: string
	currentUserId?: string
}

const MIN_POST_LENGTH = 10
const MAX_POST_LENGTH = 2000
const MIN_REPLY_LENGTH = 10
const MAX_REPLY_LENGTH = 1000

/**
 * Individual post card component
 * Displays a post with author info, edit capability, and collapsible replies
 */
export const PostCard = ({ post, postId, currentUserId }: PostCardProps) => {
	const [authorName, setAuthorName] = useState<string>('Loading...')
	const [isRepliesOpen, setIsRepliesOpen] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [editContent, setEditContent] = useState(post.content)
	const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
	const [replyContent, setReplyContent] = useState('')
	const [isSubmittingReply, setIsSubmittingReply] = useState(false)

	// Fetch replies when section is opened
	const [repliesSnapshot, repliesLoading] = useCollection(
		isRepliesOpen ? repliesQuery(postId) : null
	)

	const isAuthor = currentUserId && post.author.id === currentUserId
	const canInteract = !!currentUserId

	// Fetch author name
	useEffect(() => {
		const fetchAuthor = async () => {
			try {
				const authorDoc = await getDoc(post.author)
				if (authorDoc.exists()) {
					const authorData = authorDoc.data() as PlayerDocument
					setAuthorName(`${authorData.firstname} ${authorData.lastname}`)
				} else {
					setAuthorName('Unknown')
				}
			} catch (error) {
				logger.error('Error fetching author:', error)
				setAuthorName('Unknown')
			}
		}

		fetchAuthor()
	}, [post.author])

	const formatDate = (timestamp: PostDocument['createdAt']) => {
		try {
			const date = timestamp.toDate()
			return formatDistanceToNow(date, { addSuffix: true })
		} catch {
			return 'Recently'
		}
	}

	// Handle edit submission
	const handleEditSubmit = useCallback(async () => {
		const trimmed = editContent.trim()
		if (trimmed.length < MIN_POST_LENGTH || trimmed.length > MAX_POST_LENGTH) {
			return
		}

		setIsSubmittingEdit(true)
		try {
			await updatePostViaFunction({
				postId,
				content: trimmed,
			})
			toast.success('Post updated')
			setIsEditing(false)
		} catch (error) {
			logger.error('Failed to update post:', error)
			toast.error('Failed to update post', {
				description:
					error instanceof Error ? error.message : 'Please try again',
			})
		} finally {
			setIsSubmittingEdit(false)
		}
	}, [postId, editContent])

	// Handle reply submission
	const handleReplySubmit = useCallback(async () => {
		const trimmed = replyContent.trim()
		if (
			trimmed.length < MIN_REPLY_LENGTH ||
			trimmed.length > MAX_REPLY_LENGTH
		) {
			return
		}

		setIsSubmittingReply(true)
		try {
			await createReplyViaFunction({
				postId,
				content: trimmed,
			})
			toast.success('Reply posted')
			setReplyContent('')
		} catch (error) {
			logger.error('Failed to post reply:', error)
			toast.error('Failed to post reply', {
				description:
					error instanceof Error ? error.message : 'Please try again',
			})
		} finally {
			setIsSubmittingReply(false)
		}
	}, [postId, replyContent])

	const handleCancelEdit = () => {
		setEditContent(post.content)
		setIsEditing(false)
	}

	const isEditValid =
		editContent.trim().length >= MIN_POST_LENGTH &&
		editContent.trim().length <= MAX_POST_LENGTH

	const isReplyValid =
		replyContent.trim().length >= MIN_REPLY_LENGTH &&
		replyContent.trim().length <= MAX_REPLY_LENGTH

	return (
		<Card className='transition-all hover:shadow-md'>
			<CardHeader>
				<div className='flex items-start justify-between gap-4'>
					<CardDescription className='flex flex-wrap items-center gap-3 text-sm'>
						<Link
							to={`/players/${post.author.id}`}
							className='flex items-center gap-1.5 hover:underline focus-visible:underline focus-visible:outline-none'
						>
							<User className='h-4 w-4' aria-hidden='true' />
							<span className='font-medium'>{authorName}</span>
						</Link>
						<Separator orientation='vertical' className='h-4' />
						<span className='flex items-center gap-1.5'>
							<Calendar className='h-4 w-4' aria-hidden='true' />
							<time dateTime={post.createdAt.toDate().toISOString()}>
								{formatDate(post.createdAt)}
							</time>
						</span>
						{post.updatedAt.seconds !== post.createdAt.seconds && (
							<>
								<Separator orientation='vertical' className='h-4' />
								<Badge variant='outline' className='shrink-0'>
									Edited
								</Badge>
							</>
						)}
					</CardDescription>
					{isAuthor && !isEditing && (
						<Button
							variant='ghost'
							size='sm'
							onClick={() => setIsEditing(true)}
							title='Edit post'
						>
							<Pencil className='h-4 w-4' />
						</Button>
					)}
				</div>
			</CardHeader>

			<CardContent className='space-y-4'>
				{isEditing ? (
					<div className='space-y-3'>
						<Textarea
							value={editContent}
							onChange={(e) => setEditContent(e.target.value)}
							rows={6}
							maxLength={MAX_POST_LENGTH}
							disabled={isSubmittingEdit}
						/>
						<div className='flex items-center justify-between'>
							<p className='text-xs text-muted-foreground'>
								{editContent.trim().length}/{MAX_POST_LENGTH} characters
							</p>
							<div className='flex gap-2'>
								<Button
									variant='outline'
									size='sm'
									onClick={handleCancelEdit}
									disabled={isSubmittingEdit}
								>
									Cancel
								</Button>
								<Button
									size='sm'
									onClick={handleEditSubmit}
									disabled={!isEditValid || isSubmittingEdit}
								>
									{isSubmittingEdit ? (
										<Loader2 className='h-4 w-4 animate-spin' />
									) : (
										'Save'
									)}
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div
						className='prose prose-sm dark:prose-invert max-w-none'
						style={{ whiteSpace: 'pre-wrap' }}
					>
						{post.content}
					</div>
				)}

				{/* Replies section */}
				<Collapsible open={isRepliesOpen} onOpenChange={setIsRepliesOpen}>
					<CollapsibleTrigger asChild>
						<Button
							variant='ghost'
							size='sm'
							className='w-full justify-between'
						>
							<span className='flex items-center gap-2'>
								<MessageSquare className='h-4 w-4' />
								{post.replyCount === 0
									? 'No replies'
									: `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`}
							</span>
							{isRepliesOpen ? (
								<ChevronUp className='h-4 w-4' />
							) : (
								<ChevronDown className='h-4 w-4' />
							)}
						</Button>
					</CollapsibleTrigger>

					<CollapsibleContent className='space-y-4 pt-4'>
						{repliesLoading ? (
							<div className='flex justify-center py-4'>
								<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
							</div>
						) : (
							<>
								{repliesSnapshot?.docs.map((doc) => (
									<ReplyItem
										key={doc.id}
										reply={doc.data()}
										replyId={doc.id}
										postId={postId}
										currentUserId={currentUserId}
									/>
								))}

								{/* Reply form */}
								{canInteract && (
									<div className='space-y-2 border-t pt-4'>
										<Textarea
											value={replyContent}
											onChange={(e) => setReplyContent(e.target.value)}
											placeholder='Write a reply...'
											rows={3}
											maxLength={MAX_REPLY_LENGTH}
											disabled={isSubmittingReply}
										/>
										<div className='flex items-center justify-between'>
											<p className='text-xs text-muted-foreground'>
												{replyContent.trim().length}/{MAX_REPLY_LENGTH}
											</p>
											<Button
												size='sm'
												onClick={handleReplySubmit}
												disabled={!isReplyValid || isSubmittingReply}
											>
												{isSubmittingReply ? (
													<Loader2 className='h-4 w-4 animate-spin' />
												) : (
													'Reply'
												)}
											</Button>
										</div>
									</div>
								)}

								{!canInteract && (
									<p className='text-sm text-muted-foreground text-center py-2'>
										Sign in to reply
									</p>
								)}
							</>
						)}
					</CollapsibleContent>
				</Collapsible>
			</CardContent>
		</Card>
	)
}

/**
 * Individual reply component
 */
interface ReplyItemProps {
	reply: ReplyDocument
	replyId: string
	postId: string
	currentUserId?: string
}

const ReplyItem = ({
	reply,
	replyId,
	postId,
	currentUserId,
}: ReplyItemProps) => {
	const [authorName, setAuthorName] = useState<string>('Loading...')
	const [isEditing, setIsEditing] = useState(false)
	const [editContent, setEditContent] = useState(reply.content)
	const [isSubmitting, setIsSubmitting] = useState(false)

	const isAuthor = currentUserId && reply.author.id === currentUserId

	useEffect(() => {
		const fetchAuthor = async () => {
			try {
				const authorDoc = await getDoc(reply.author)
				if (authorDoc.exists()) {
					const authorData = authorDoc.data() as PlayerDocument
					setAuthorName(`${authorData.firstname} ${authorData.lastname}`)
				} else {
					setAuthorName('Unknown')
				}
			} catch (error) {
				logger.error('Error fetching reply author:', error)
				setAuthorName('Unknown')
			}
		}

		fetchAuthor()
	}, [reply.author])

	const formatDate = (timestamp: ReplyDocument['createdAt']) => {
		try {
			const date = timestamp.toDate()
			return formatDistanceToNow(date, { addSuffix: true })
		} catch {
			return 'Recently'
		}
	}

	const handleEditSubmit = async () => {
		const trimmed = editContent.trim()
		if (
			trimmed.length < MIN_REPLY_LENGTH ||
			trimmed.length > MAX_REPLY_LENGTH
		) {
			return
		}

		setIsSubmitting(true)
		try {
			await updateReplyViaFunction({
				postId,
				replyId,
				content: trimmed,
			})
			toast.success('Reply updated')
			setIsEditing(false)
		} catch (error) {
			logger.error('Failed to update reply:', error)
			toast.error('Failed to update reply', {
				description:
					error instanceof Error ? error.message : 'Please try again',
			})
		} finally {
			setIsSubmitting(false)
		}
	}

	const isEditValid =
		editContent.trim().length >= MIN_REPLY_LENGTH &&
		editContent.trim().length <= MAX_REPLY_LENGTH

	return (
		<div className='border-l-2 border-muted pl-4 py-2'>
			<div className='flex items-center justify-between mb-2'>
				<div className='flex items-center gap-2 text-sm text-muted-foreground'>
					<Link
						to={`/players/${reply.author.id}`}
						className='font-medium hover:underline focus-visible:underline focus-visible:outline-none'
					>
						{authorName}
					</Link>
					<span>·</span>
					<time dateTime={reply.createdAt.toDate().toISOString()}>
						{formatDate(reply.createdAt)}
					</time>
					{reply.updatedAt.seconds !== reply.createdAt.seconds && (
						<Badge variant='outline' className='text-xs'>
							Edited
						</Badge>
					)}
				</div>
				{isAuthor && !isEditing && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => setIsEditing(true)}
						title='Edit reply'
					>
						<Pencil className='h-3 w-3' />
					</Button>
				)}
			</div>

			{isEditing ? (
				<div className='space-y-2'>
					<Textarea
						value={editContent}
						onChange={(e) => setEditContent(e.target.value)}
						rows={3}
						maxLength={MAX_REPLY_LENGTH}
						disabled={isSubmitting}
					/>
					<div className='flex items-center justify-between'>
						<p className='text-xs text-muted-foreground'>
							{editContent.trim().length}/{MAX_REPLY_LENGTH}
						</p>
						<div className='flex gap-2'>
							<Button
								variant='outline'
								size='sm'
								onClick={() => {
									setEditContent(reply.content)
									setIsEditing(false)
								}}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
							<Button
								size='sm'
								onClick={handleEditSubmit}
								disabled={!isEditValid || isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 className='h-4 w-4 animate-spin' />
								) : (
									'Save'
								)}
							</Button>
						</div>
					</div>
				</div>
			) : (
				<p className='text-sm' style={{ whiteSpace: 'pre-wrap' }}>
					{reply.content}
				</p>
			)}
		</div>
	)
}
