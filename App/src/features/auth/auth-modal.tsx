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

interface AuthModalContentProps {
	onSuccess: () => void
}

const AuthModalContent = ({ onSuccess }: AuthModalContentProps) => {
	return (
		<>
			<VisuallyHidden>
				<DialogTitle>Authentication</DialogTitle>
				<DialogDescription>
					Log in to your account or create a new one
				</DialogDescription>
			</VisuallyHidden>
			<AuthForm onSuccess={onSuccess} />
		</>
	)
}

interface AuthModalProps {
	isOpen: boolean
	onClose: () => void
}

export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
	const isMobile = useIsMobile()

	return (
		<>
			{/* Mobile Sheet - always rendered */}
			<Sheet open={isOpen && isMobile} onOpenChange={onClose}>
				<SheetContent className='pt-10 px-4 w-full max-w-[340px] sm:!max-w-[340px]'>
					<AuthModalContent onSuccess={onClose} />
				</SheetContent>
			</Sheet>

			{/* Desktop Dialog - always rendered */}
			<Dialog open={isOpen && !isMobile} onOpenChange={onClose}>
				<DialogContent className='sm:max-w-[425px] pt-10 data-[state=open]:duration-500 data-[state=closed]:duration-500'>
					<AuthModalContent onSuccess={onClose} />
				</DialogContent>
			</Dialog>
		</>
	)
}
