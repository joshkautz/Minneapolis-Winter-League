import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { createPostViaFunction } from '@/firebase/collections/functions'
import { logger, errorMessage } from '@/shared/utils'
import { TEXT_RULES, textProblem } from '@/shared/text-rules'

interface CreatePostDialogProps {
	seasonId: string
	canPost: boolean
}

const { min: MIN_CONTENT_LENGTH, max: MAX_CONTENT_LENGTH } =
	TEXT_RULES.postContent

/**
 * Dialog for creating a new post
 */
export const CreatePostDialog = ({
	seasonId,
	canPost,
}: CreatePostDialogProps) => {
	const [open, setOpen] = useState(false)
	const [content, setContent] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	const trimmedContent = content.trim()
	const isValidLength = textProblem(content, TEXT_RULES.postContent) === null

	const handleSubmit = async () => {
		if (!isValidLength || isSubmitting) return

		setIsSubmitting(true)
		try {
			await createPostViaFunction({
				content: trimmedContent,
				seasonId,
			})
			toast.success('Post created successfully')
			setContent('')
			setOpen(false)
		} catch (error) {
			logger.error('Failed to create post', error)
			toast.error('Failed to create post', {
				description: errorMessage(error, 'Please try again.'),
			})
		} finally {
			setIsSubmitting(false)
		}
	}

	if (!canPost) {
		return (
			<Button variant='outline' disabled>
				<Plus className='h-4 w-4 mr-2' />
				Sign in to post
			</Button>
		)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className='h-4 w-4 mr-2' />
					Create Post
				</Button>
			</DialogTrigger>
			<DialogContent className='sm:max-w-[500px]'>
				<DialogHeader>
					<DialogTitle>Create Post</DialogTitle>
					<DialogDescription>
						Share a message with the community for this season.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4 py-4'>
					<div className='space-y-2'>
						<Label htmlFor='content'>Your message</Label>
						<Textarea
							id='content'
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder="What's on your mind?"
							rows={6}
							maxLength={MAX_CONTENT_LENGTH}
							disabled={isSubmitting}
						/>
						<p className='text-xs text-muted-foreground text-right'>
							{trimmedContent.length}/{MAX_CONTENT_LENGTH} characters
							{trimmedContent.length < MIN_CONTENT_LENGTH && (
								<span className='ml-2 text-destructive'>
									(minimum {MIN_CONTENT_LENGTH})
								</span>
							)}
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => setOpen(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!isValidLength || isSubmitting}
					>
						{isSubmitting ? (
							<>
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								Posting...
							</>
						) : (
							'Post'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
