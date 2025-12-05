import { useEffect, useState } from 'react'
import { getDoc } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { User, Calendar } from 'lucide-react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { NewsDocument, PlayerDocument } from '@/types'
import { logger } from '@/shared/utils'

interface NewsCardProps {
	post: NewsDocument
	postId: string
}

/**
 * Individual news post card component
 * Displays a single news post with author info and timestamp
 */
export const NewsCard = ({ post }: NewsCardProps) => {
	const [authorName, setAuthorName] = useState<string>('Loading...')

	// Fetch author name
	useEffect(() => {
		const fetchAuthor = async () => {
			try {
				const authorDoc = await getDoc(post.author)
				if (authorDoc.exists()) {
					const authorData = authorDoc.data() as PlayerDocument
					setAuthorName(`${authorData.firstname} ${authorData.lastname}`)
				} else {
					setAuthorName('Unknown Author')
				}
			} catch (error) {
				logger.error('Error fetching author:', error)
				setAuthorName('Unknown Author')
			}
		}

		fetchAuthor()
	}, [post.author])

	const formatDate = (timestamp: NewsDocument['createdAt']) => {
		try {
			const date = timestamp.toDate()
			return formatDistanceToNow(date, { addSuffix: true })
		} catch {
			return 'Recently'
		}
	}

	return (
		<Card className='transition-all hover:shadow-md'>
			<CardHeader>
				<div className='flex items-start justify-between gap-4'>
					<div className='flex-1 min-w-0'>
						<CardTitle className='text-2xl mb-2 break-words'>
							{post.title}
						</CardTitle>
						<CardDescription className='flex flex-wrap items-center gap-3 text-sm'>
							<span className='flex items-center gap-1.5'>
								<User className='h-4 w-4' aria-hidden='true' />
								<span className='font-medium'>{authorName}</span>
							</span>
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
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div
					className='prose prose-sm dark:prose-invert max-w-none'
					style={{ whiteSpace: 'pre-wrap' }}
				>
					{post.content}
				</div>
			</CardContent>
		</Card>
	)
}
