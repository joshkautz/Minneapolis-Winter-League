import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/utils'

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
}: PageHeaderProps) => {
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
		</div>
	)
}
