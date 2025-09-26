import { ScrollArea } from '@/components/ui/scroll-area'
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from '@/components/ui/card'
import { cn } from '@/shared/utils'
import { ReactNode } from 'react'

export const NotificationCard = ({
	title,
	description,
	children,
	scrollArea,
	className,
	moreActions,
	searchBar,
	footerContent,
}: {
	title?: ReactNode
	description?: string
	scrollArea?: boolean
	children: ReactNode
	className?: string
	moreActions?: ReactNode
	searchBar?: ReactNode
	footerContent?: ReactNode
}) => {
	return (
		<Card className={cn('max-w-[888px]', className)}>
			<CardHeader className='relative'>
				<CardTitle className='select-none'>{title}</CardTitle>
				{description && (
					<CardDescription className='select-none max-w-[600px]'>
						{description}
					</CardDescription>
				)}
				{moreActions && moreActions}
				{searchBar && searchBar}
			</CardHeader>
			{scrollArea ? (
				<ScrollArea className='h-[600px]'>
					<CardContent className='min-w-0'>{children}</CardContent>
				</ScrollArea>
			) : (
				<CardContent className='min-w-0'>{children}</CardContent>
			)}
			{footerContent && <CardFooter>{footerContent}</CardFooter>}
		</Card>
	)
}
