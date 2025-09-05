import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useIsMobile } from '@/shared/hooks'
import { AuthForm } from './auth-form'

interface AuthModalProps {
	isOpen: boolean
	onClose: () => void
}

export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
	const isMobile = useIsMobile()

	const content = (
		<>
			<VisuallyHidden>
				<DialogTitle>Authentication</DialogTitle>
				<DialogDescription>
					Sign in to your account or create a new one
				</DialogDescription>
			</VisuallyHidden>
			<AuthForm onSuccess={onClose} />
		</>
	)

	return (
		<>
			{/* Mobile Sheet - always rendered */}
			<Sheet open={isOpen && isMobile} onOpenChange={onClose}>
				<SheetContent className='w-full pt-10 !w-[340px] !max-w-[340px] sm:!w-[340px] sm:!max-w-[340px]'>
					{content}
				</SheetContent>
			</Sheet>

			{/* Desktop Dialog - always rendered */}
			<Dialog open={isOpen && !isMobile} onOpenChange={onClose}>
				<DialogContent className='sm:max-w-[425px] pt-10 data-[state=open]:duration-500 data-[state=closed]:duration-500'>
					{content}
				</DialogContent>
			</Dialog>
		</>
	)
}
