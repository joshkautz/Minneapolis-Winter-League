import { useState } from 'react'
import { cn } from '@/shared/utils'

interface TeamLogoProps {
	/** The team's name, whose first letter stands in for a missing logo. */
	name: string | undefined
	logo: string | null | undefined
	/** The frame's size and shape, e.g. `h-10 w-10 rounded-full`. */
	className?: string
	/** Extra classes for the image itself, e.g. a hover zoom. */
	imageClassName?: string
	/**
	 * The size of the initial shown without a logo, e.g. `text-sm`. Leave it
	 * out for a plain swatch, as the smallest logos use.
	 */
	initialClassName?: string
	/** Defaults to "<name> logo". Pass '' where the name is written beside it. */
	alt?: string
	loading?: 'lazy' | 'eager'
}

/**
 * A team's logo, or the league's gradient with the team's initial when it
 * has none or the image fails to load.
 */
export const TeamLogo = ({
	name,
	logo,
	className,
	imageClassName,
	initialClassName,
	alt = `${name ?? 'Team'} logo`,
	loading,
}: TeamLogoProps) => {
	// Remembers which URL failed, so a new logo gets its own chance to load.
	const [failedLogo, setFailedLogo] = useState<string | null>(null)
	const showImage = Boolean(logo) && logo !== failedLogo

	return (
		<div className={cn('overflow-hidden bg-muted', className)}>
			{showImage ? (
				<img
					src={logo ?? undefined}
					alt={alt}
					loading={loading}
					className={cn('h-full w-full object-cover', imageClassName)}
					onError={() => setFailedLogo(logo ?? null)}
				/>
			) : (
				<div
					className='flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-sky-300'
					role={alt ? 'img' : undefined}
					aria-label={alt || undefined}
				>
					{initialClassName && (
						<span
							aria-hidden='true'
							className={cn(
								'font-bold text-primary-foreground',
								initialClassName
							)}
						>
							{name?.trim().charAt(0).toUpperCase() || 'T'}
						</span>
					)}
				</div>
			)}
		</div>
	)
}
