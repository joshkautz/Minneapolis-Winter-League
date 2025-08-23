import { NavLink } from 'react-router-dom'
import { cn } from '@/shared/utils'

interface NavigationMenuProps {
	items: Array<{ label: string; path: string; alt: string }>
}

/**
 * Desktop navigation menu component
 */
export const NavigationMenu = ({ items }: NavigationMenuProps) => {
	return (
		<nav className="flex items-center justify-start space-x-6 text-sm font-medium flex-1">
			{items.map((entry) => (
				<NavLink
					key={entry.path}
					to={entry.path}
					className={({ isActive }) =>
						cn(
							'transition-colors hover:text-foreground/80 text-foreground/60',
							isActive ? 'text-foreground' : ''
						)
					}
				>
					{entry.label}
				</NavLink>
			))}
		</nav>
	)
}
