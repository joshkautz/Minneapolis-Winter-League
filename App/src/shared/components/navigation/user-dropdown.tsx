import { Link } from 'react-router-dom'
import { ReloadIcon } from '@radix-ui/react-icons'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface UserDropdownProps {
	userInitials: string
	userContent: Array<{ label: string; path: string; alt: string }>
	hasPendingOffers: boolean
	hasRequiredTasks: boolean
	signOutLoading: boolean
	onSignOut: () => void
}

/**
 * User dropdown component with avatar and menu for authenticated users
 */
export const UserDropdown = ({
	userInitials,
	userContent,
	hasPendingOffers,
	hasRequiredTasks,
	signOutLoading,
	onSignOut,
}: UserDropdownProps) => {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className='overflow-visible cursor-pointer'>
					{(hasPendingOffers || hasRequiredTasks) && (
						<span className='z-10 absolute bottom-0 right-0 w-2 h-2 rounded-full bg-primary' />
					)}
					<AvatarFallback className='transition-colors bg-secondary hover:bg-accent dark:hover:text-background uppercase'>
						{userInitials}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent className='w-56'>
				<DropdownMenuGroup>
					{userContent.map(({ path, label, alt }) => (
						<DropdownMenuItem key={path} asChild>
							<Link to={path} aria-label={alt} className='flex items-center'>
								{path === '/manage' && hasPendingOffers ? (
									<>
										{label}
										<span className='relative flex w-2 h-2 ml-auto'>
											<span className='relative inline-flex w-2 h-2 rounded-full bg-primary' />
										</span>
									</>
								) : path === '/profile' && hasRequiredTasks ? (
									<>
										{label}
										<span className='relative flex w-2 h-2 ml-auto'>
											<span className='relative inline-flex w-2 h-2 rounded-full bg-primary' />
										</span>
									</>
								) : (
									label
								)}
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={onSignOut}
					disabled={signOutLoading}
					className='cursor-pointer'
				>
					{signOutLoading ? (
						<>
							<ReloadIcon className='mr-2 h-4 w-4 animate-spin' />
							Logging out...
						</>
					) : (
						'Log out'
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
