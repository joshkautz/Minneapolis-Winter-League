import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/utils'
import { useSeasonsContext } from '@/providers'
import { useIsMobile } from '@/shared/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { SeasonSelect } from './season-select'

interface PageHeaderProps {
	/**
	 * Page title text
	 */
	title: string
	/**
	 * Page description text
	 */
	description?: string
	/**
	 * Optional icon to display next to the title
	 */
	icon?: LucideIcon
	/**
	 * Custom icon element (alternative to icon prop)
	 */
	iconElement?: ReactNode
	/**
	 * Additional CSS classes for the header container
	 */
	className?: string
	/**
	 * Additional CSS classes for the title
	 */
	titleClassName?: string
	/**
	 * Additional CSS classes for the description
	 */
	descriptionClassName?: string
	/**
	 * Show interactive season selector below description
	 */
	showSeasonIndicator?: boolean
}

/**
 * Standard page header component with title, optional icon, and description
 * Replaces repeated header patterns across pages
 */
export const PageHeader = ({
	title,
	description,
	icon: Icon,
	iconElement,
	className,
	titleClassName,
	descriptionClassName,
	showSeasonIndicator = false,
}: PageHeaderProps) => {
	const { seasonsQuerySnapshotLoading } = useSeasonsContext()
	const isMobile = useIsMobile()

	return (
		<div className={cn('text-center space-y-4', className)}>
			<h1
				className={cn(
					'text-3xl font-bold flex items-center justify-center gap-3',
					titleClassName
				)}
			>
				{Icon && <Icon className='h-8 w-8' />}
				{iconElement}
				{title}
			</h1>
			{description && (
				<p className={cn('text-muted-foreground', descriptionClassName)}>
					{description}
				</p>
			)}
			{showSeasonIndicator && (
				<div className='flex justify-center'>
					<div className={cn('w-full max-w-xs', isMobile && 'max-w-sm')}>
						{seasonsQuerySnapshotLoading ? (
							<Skeleton
								className={cn('w-full rounded-md', isMobile ? 'h-10' : 'h-9')}
							/>
						) : (
							<SeasonSelect mobile={isMobile} />
						)}
					</div>
				</div>
			)}
		</div>
	)
}
