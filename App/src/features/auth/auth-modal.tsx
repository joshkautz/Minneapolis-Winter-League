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

	if (isMobile) {
		return (
			<Sheet open={isOpen} onOpenChange={onClose}>
				<SheetContent className="w-full pt-10">{content}</SheetContent>
			</Sheet>
		)
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px] pt-10">
				{content}
			</DialogContent>
		</Dialog>
	)
}
